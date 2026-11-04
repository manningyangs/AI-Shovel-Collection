/**
 * 应用 Session（Bearer Token）管理。
 *  - Token 只在响应中出现一次，D1 仅保存 SHA-256 Hash（任务书 §17.1）。
 *  - 默认有效期 8 小时，支持撤销（登出）。
 */
import type { Env, SessionRow } from "./types";
import { ApiError } from "./types";
import { randomBase64Url, sha256Hex } from "./security";

/** 创建新 session，返回明文 token（仅此一次） */
export async function createSession(
  env: Env,
  githubUserId: number,
  githubLogin: string,
): Promise<{ token: string; expiresAt: number }> {
  const token = randomBase64Url(32);
  const tokenHash = await sha256Hex(token);
  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(env.SESSION_TTL_SECONDS) || 28800;
  const expiresAt = now + ttl;

  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, github_user_id, github_login, created_at, expires_at, revoked)
     VALUES (?, ?, ?, ?, ?, 0)`,
  )
    .bind(tokenHash, githubUserId, githubLogin, now, expiresAt)
    .run();

  return { token, expiresAt };
}

/** 根据 Bearer token 查有效 session；无效/过期/已撤销返回 null */
export async function getSession(env: Env, token: string): Promise<SessionRow | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT token_hash, github_user_id, github_login, created_at, expires_at, revoked
     FROM sessions WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .first<SessionRow>();
  if (!row) return null;
  if (row.revoked === 1) return null;
  if (row.expires_at <= now) return null;
  return row;
}

/** 从 Authorization: Bearer 头解析并校验；失败抛 401 */
export async function requireSession(env: Env, authHeader: string | undefined): Promise<SessionRow> {
  const m = /^Bearer\s+(.+)$/i.exec((authHeader || "").trim());
  if (!m) throw new ApiError(401, "UNAUTHORIZED", "请先登录");
  const session = await getSession(env, m[1]);
  if (!session) throw new ApiError(401, "INVALID_SESSION", "登录已过期，请重新登录");
  return session;
}

/** 登出：撤销当前 token（幂等） */
export async function revokeSession(env: Env, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await env.DB.prepare(
    `UPDATE sessions SET revoked = 1 WHERE token_hash = ?`,
  )
    .bind(tokenHash)
    .run();
}
