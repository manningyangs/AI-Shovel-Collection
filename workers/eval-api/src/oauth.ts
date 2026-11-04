/**
 * GitHub App OAuth / PKCE 登录（任务书 §八）。
 *
 * 流程：
 *  GET /auth/github/start        → state + PKCE 存 D1 → 跳 GitHub 授权
 *  GET /auth/github/callback     → 校验 state 一次性 → code 换 token → GitHub /user 验证
 *                                  → 创建一次性 Ticket → 302 到站点 callback#ticket=...
 *  POST /api/auth/exchange       → Ticket 一次性消费 → 创建 Session（只回传一次）
 *  GET /api/me                   → 当前登录用户
 *  POST /api/auth/logout         → 撤销 Session
 *
 * 安全：GitHub User Access Token 只在 Worker 内存中短暂使用，取完 /user 即丢弃，
 *      不入 D1、不回浏览器；浏览器只持有自研 Session Token。
 */
import type { Context } from "hono";
import type { AppEnv, Env } from "./types";
import { ApiError } from "./types";
import { base64UrlEncode, randomBase64Url, sha256Hex } from "./security";
import { createSession, getSession, requireSession, revokeSession } from "./sessions";

const OAUTH_STATE_TTL = 600; // 10 分钟（任务书 §9.1）
const TICKET_TTL = 120; // 2 分钟（任务书 §9.2）
const GITHUB_API = "https://api.github.com";

interface OAuthStateRow {
  state_hash: string;
  verifier: string;
  return_to: string | null;
  created_at: number;
  expires_at: number;
}

/** 站点认证回调页地址（绝对 URL） */
function expectedCallbackUrl(env: Env): URL {
  const site = new URL(env.PUBLIC_SITE_BASE_URL);
  const basePath = site.pathname.replace(/\/+$/, "");
  return new URL(`${basePath}/auth/callback`, site.origin);
}

/**
 * 校验并解析 return_to：
 * 前端传相对路径 "/AI-Shovel-Collection/auth/callback"（或绝对地址），
 * 一律要求最终等于站点认证回调页，防止 open redirect（任务书 §17）。
 */
function resolveReturnTo(env: Env, raw: string | undefined): string {
  const expected = expectedCallbackUrl(env);
  if (!raw) throw new ApiError(400, "INVALID_RETURN_TO", "缺少 return_to 参数");
  let candidate: URL;
  try {
    candidate = raw.startsWith("http") ? new URL(raw) : new URL(raw, expected.origin);
  } catch {
    throw new ApiError(400, "INVALID_RETURN_TO", "return_to 非法");
  }
  if (candidate.origin !== expected.origin) {
    throw new ApiError(400, "INVALID_RETURN_TO", "return_to 必须指向本站点");
  }
  if (candidate.pathname.replace(/\/+$/, "") !== expected.pathname) {
    throw new ApiError(400, "INVALID_RETURN_TO", "return_to 必须是站点认证回调页");
  }
  candidate.hash = "";
  candidate.search = "";
  return candidate.toString();
}

/* ----------------------------- 1. 登录开始 ----------------------------- */

export async function handleAuthStart(c: Context<AppEnv>): Promise<Response> {
  const env = c.env;
  const returnTo = resolveReturnTo(env, c.req.query("return_to"));

  const state = randomBase64Url(32);
  const verifier = randomBase64Url(48); // 43-128 字符，满足 PKCE
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO oauth_states (state_hash, verifier, return_to, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(await sha256Hex(state), verifier, returnTo, now, now + OAUTH_STATE_TTL)
    .run();

  const challenge = base64UrlEncode(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const cbUrl = `${new URL(c.req.url).origin}/auth/github/callback`;

  const githubUrl = new URL("https://github.com/login/oauth/authorize");
  githubUrl.searchParams.set("client_id", env.GITHUB_APP_CLIENT_ID);
  githubUrl.searchParams.set("redirect_uri", cbUrl);
  githubUrl.searchParams.set("state", state);
  githubUrl.searchParams.set("code_challenge", challenge);
  githubUrl.searchParams.set("code_challenge_method", "S256");

  return c.redirect(githubUrl.toString(), 302);
}

/* --------------------------- 2. GitHub 回调 --------------------------- */

export async function handleAuthCallback(c: Context<AppEnv>): Promise<Response> {
  const env = c.env;
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (c.req.query("error")) {
    throw new ApiError(
      400,
      "GITHUB_AUTH_DENIED",
      `GitHub 授权被拒绝：${c.req.query("error_description") || c.req.query("error")}`,
    );
  }
  if (!code || !state) throw new ApiError(400, "MISSING_CODE", "缺少 code 或 state");

  // 校验 state：先读（拿 verifier + return_to），再一次性删除（防并发重放）
  const stateHash = await sha256Hex(state);
  const now = Math.floor(Date.now() / 1000);
  const stateRow = await env.DB.prepare(
    `SELECT state_hash, verifier, return_to, created_at, expires_at
     FROM oauth_states WHERE state_hash = ? AND expires_at > ?`,
  )
    .bind(stateHash, now)
    .first<OAuthStateRow>();
  if (!stateRow) {
    throw new ApiError(400, "INVALID_STATE", "OAuth state 无效或已过期，请重新登录");
  }
  const del = await env.DB.prepare(`DELETE FROM oauth_states WHERE state_hash = ?`)
    .bind(stateHash)
    .run();
  if ((del.meta.changes ?? 0) === 0) {
    throw new ApiError(400, "STATE_ALREADY_USED", "OAuth state 已被使用，请重新登录");
  }
  const returnTo = stateRow.return_to || expectedCallbackUrl(env).toString();

  // code 换 User Access Token（携带 PKCE verifier）
  const cbUrl = `${new URL(c.req.url).origin}/auth/github/callback`;
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "ai-shovel-eval-worker",
    },
    body: new URLSearchParams({
      client_id: env.GITHUB_APP_CLIENT_ID,
      client_secret: env.GITHUB_APP_CLIENT_SECRET,
      code,
      redirect_uri: cbUrl,
      code_verifier: stateRow.verifier,
    }).toString(),
  });
  const tokenData = (await tokenRes.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!tokenData?.access_token) {
    throw new ApiError(
      502,
      "GITHUB_TOKEN_EXCHANGE_FAILED",
      `GitHub 授权码兑换失败：${tokenData?.error_description || tokenData?.error || "unknown"}`,
    );
  }

  // 用 User Access Token 验证用户身份（取完即丢弃，不入 D1、不回浏览器）
  const userRes = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "ai-shovel-eval-worker",
    },
  });
  const user = userRes.ok
    ? ((await userRes.json().catch(() => null)) as { id?: number; login?: string } | null)
    : null;
  if (!user?.id || !user?.login) {
    throw new ApiError(502, "GITHUB_USER_LOOKUP_FAILED", "无法从 GitHub 获取用户身份");
  }

  // 创建一次性 Login Ticket → 重定向到站点 callback（ticket 走 URL fragment）
  const ticket = randomBase64Url(32);
  const ticketHash = await sha256Hex(ticket);
  await env.DB.prepare(
    `INSERT INTO login_tickets (ticket_hash, github_user_id, github_login, created_at, expires_at, used)
     VALUES (?, ?, ?, ?, ?, 0)`,
  )
    .bind(ticketHash, user.id, user.login, now, now + TICKET_TTL)
    .run();

  const dest = new URL(returnTo);
  dest.hash = `ticket=${encodeURIComponent(ticket)}`;
  return c.redirect(dest.toString(), 302);
}

/* ------------------------- 3. Ticket 换 Session ------------------------- */

export async function handleExchange(c: Context<AppEnv>): Promise<Response> {
  const env = c.env;
  const body = (await c.req.json().catch(() => null)) as { ticket?: unknown } | null;
  const ticket = typeof body?.ticket === "string" ? body.ticket : "";
  if (!ticket || ticket.length > 200) {
    throw new ApiError(400, "MISSING_TICKET", "缺少一次性登录凭证");
  }

  const ticketHash = await sha256Hex(ticket);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT ticket_hash, github_user_id, github_login, created_at, expires_at, used
     FROM login_tickets WHERE ticket_hash = ? AND expires_at > ?`,
  )
    .bind(ticketHash, now)
    .first<{ ticket_hash: string; github_user_id: number; github_login: string; used: number }>();
  if (!row) {
    throw new ApiError(400, "TICKET_INVALID", "登录凭证无效或已过期，请重新登录");
  }
  if (row.used === 1) {
    throw new ApiError(409, "TICKET_USED", "登录凭证已被使用，请重新登录");
  }

  // 一次性消费（条件更新防并发双花）
  const used = await env.DB.prepare(
    `UPDATE login_tickets SET used = 1 WHERE ticket_hash = ? AND used = 0`,
  )
    .bind(ticketHash)
    .run();
  if ((used.meta.changes ?? 0) === 0) {
    throw new ApiError(409, "TICKET_USED", "登录凭证已被使用，请重新登录");
  }

  const session = await createSession(env, row.github_user_id, row.github_login);
  return c.json({
    success: true,
    session_token: session.token,
    expires_at: session.expiresAt,
    user: { id: row.github_user_id, login: row.github_login },
  });
}

/* ---------------------------- 4. 当前用户 ---------------------------- */

export async function handleMe(c: Context<AppEnv>): Promise<Response> {
  const session = await requireSession(c.env, c.req.header("Authorization"));
  return c.json({
    success: true,
    user: { id: session.github_user_id, login: session.github_login },
  });
}

/* ------------------------------ 5. 登出 ------------------------------ */

export async function handleLogout(c: Context<AppEnv>): Promise<Response> {
  // 登出幂等：token 无效也返回成功（前端总是清本地 session）
  const m = /^Bearer\s+(.+)$/i.exec((c.req.header("Authorization") || "").trim());
  if (m && (await getSession(c.env, m[1]))) {
    await revokeSession(c.env, m[1]);
  }
  return c.json({ success: true });
}
