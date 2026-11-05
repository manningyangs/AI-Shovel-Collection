/**
 * Worker：提交收录核心路由（任务书 §五）
 *
 * 路由一览：
 *   POST   /api/collection-submissions           创建提交
 *   GET    /api/collection-submissions/:id       查询状态
 *   POST   /internal/collection-submissions/status   Actions 回调（COLLECTION_CALLBACK_SECRET）
 *
 * 安全红线：
 *   - 客户端 IP 不明文存，只存 HMAC(IP, COLLECTION_IP_SALT)
 *   - GitHub App Installation Token 只在 Worker 服务端使用，不暴露给前端
 *   - /internal/* 不加 Origin guard（Actions 内部调用），但加 COLLECTION_CALLBACK_SECRET 校验
 *   - 提交编号用随机十六进制（crypto.getRandomValues），不递增
 */
import type { Context } from "hono";
import type { AppEnv } from "./types";
import { ApiError } from "./types";
import { allowedOrigins, corsHeadersFor } from "./security";

/* ============================================================
 * 常量 & 工具
 * ============================================================ */

const VALID_STATUS = new Set([
  "queued",
  "dispatching",
  "processing",
  "candidate_added",
  "duplicate",
  "rejected",
  "failed",
]);

const ACTIVE_STATUSES = new Set(["queued", "dispatching", "processing"]);

const REASON_MAX = 500;
const URL_MAX = 400;
const IP_LIMIT_WINDOW = 86_400; // 24h
const SUBMISSION_ID_BYTES = 16; // 128-bit 随机

const GITHUB_REPO_RE = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)\/?.*$/i;

function randomSubmissionId(): string {
  const buf = new Uint8Array(SUBMISSION_ID_BYTES);
  crypto.getRandomValues(buf);
  // base16 + 前 2 位前缀，保证可读
  const hex = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  return `CS-${hex.slice(0, 32)}`;
}

/** HMAC-SHA256 恒定时间比较（任务书 §5.3） */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

async function hmacSha256(key: string, msg: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function extractClientIp(c: Context): string {
  // Cloudflare Worker 标准：cf.connectingIp；其次 x-forwarded-for 第一个
  const cfIp = c.req.raw.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.split(",")[0].trim();
  const xfwd = c.req.raw.headers.get("x-forwarded-for");
  if (xfwd) return xfwd.split(",")[0].trim();
  return "0.0.0.0"; // 兜底（无法识别 IP 的情况下限流降级，但仍允许提交）
}

function parseGithubRepo(url: string): { owner: string; repo: string; canonical: string } | null {
  const m = url.trim().match(GITHUB_REPO_RE);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, "");
  // 规范化：owner 小写，保留 repo 原大小写（GitHub 不区分）
  return { owner: owner.toLowerCase(), repo, canonical: `${owner.toLowerCase()}/${repo}` };
}

/* ============================================================
 * D1 辅助
 * ============================================================ */

type CollectionRow = {
  submission_id: string;
  repo_owner: string;
  repo_name: string;
  canonical_repo: string;
  repo_url: string;
  reason: string | null;
  status: string;
  status_message: string | null;
  failure_code: string | null;
  workflow_run_id: number | null;
  requester_hash: string;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  duplicate_of: string | null;
};

async function findActiveByCanonical(env: AppEnv["Bindings"], canonical: string): Promise<CollectionRow | null> {
  const row = await env.DB.prepare(
    `SELECT * FROM collection_submissions
     WHERE canonical_repo = ? AND status IN ('queued','dispatching','processing')
     ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(canonical)
    .first<CollectionRow>();
  return row ?? null;
}

async function countRecentByHash(
  env: AppEnv["Bindings"],
  hash: string,
  windowSeconds: number,
): Promise<number> {
  const since = Math.floor(Date.now() / 1000) - windowSeconds;
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM collection_submissions
     WHERE requester_hash = ? AND created_at >= ?`,
  )
    .bind(hash, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function insertSubmission(
  env: AppEnv["Bindings"],
  id: string,
  data: {
    repoOwner: string;
    repoName: string;
    canonical: string;
    repoUrl: string;
    reason: string | null;
    requesterHash: string;
  },
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO collection_submissions
     (submission_id, repo_owner, repo_name, canonical_repo, repo_url, reason,
      requester_hash, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
  )
    .bind(
      id,
      data.repoOwner,
      data.repoName,
      data.canonical,
      data.repoUrl,
      data.reason,
      data.requesterHash,
      now,
      now,
    )
    .run();
}

async function getSubmission(
  env: AppEnv["Bindings"],
  id: string,
): Promise<CollectionRow | null> {
  const row = await env.DB.prepare(
    "SELECT * FROM collection_submissions WHERE submission_id = ?",
  )
    .bind(id)
    .first<CollectionRow>();
  return row ?? null;
}

async function updateSubmissionStatus(
  env: AppEnv["Bindings"],
  id: string,
  status: string,
  message?: string,
  failureCode?: string,
  workflowRunId?: number | null,
  duplicateOf?: string | null,
): Promise<void> {
  if (!VALID_STATUS.has(status)) {
    throw new ApiError(400, "INVALID_STATUS", `Unknown status: ${status}`);
  }
  const now = Math.floor(Date.now() / 1000);
  const completed = ACTIVE_STATUSES.has(status) ? null : now;
  await env.DB.prepare(
    `UPDATE collection_submissions
     SET status = ?, status_message = ?, updated_at = ?,
         completed_at = COALESCE(?, completed_at),
         failure_code = COALESCE(?, failure_code),
         workflow_run_id = COALESCE(?, workflow_run_id),
         duplicate_of = COALESCE(?, duplicate_of)
     WHERE submission_id = ?`,
  )
    .bind(status, message ?? null, now, completed, failureCode ?? null, workflowRunId ?? null, duplicateOf ?? null, id)
}

/* ============================================================
 * GitHub App Installation Token（复用现有凭据，不引入新 PAT）
 * ============================================================ */

async function dispatchCollectionWorkflow(
  env: AppEnv["Bindings"],
  id: string,
  repoOwner: string,
  repoName: string,
  repoUrl: string,
  reason: string | null,
): Promise<number | null> {
  const { installationToken } = await import("./github-app");
  const token = await installationToken(env);
  const ownerRepo = env.GITHUB_API_REPOSITORY;
  const workflowFile = env.COLLECTION_WORKFLOW_FILE || "collection-submission.yml";

  const body = JSON.stringify({
    ref: "main",
    inputs: {
      submission_id: id,
      repo_owner: repoOwner,
      repo_name: repoName,
      repo_url: repoUrl,
      reason: reason ?? "",
    },
  });

  const url = `https://api.github.com/repos/${ownerRepo}/actions/workflows/${workflowFile}/dispatches`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-shovel-collection-worker",
    },
    body,
  });

  if (!resp.ok) {
    const bodyText = await resp.text().catch(() => "");
    throw new ApiError(
      502,
      "WORKFLOW_DISPATCH_FAILED",
      `触发自动校验工作流失败 (HTTP ${resp.status})`,
      { detail: bodyText.slice(0, 200) },
    );
  }

  if (resp.status === 204) return null;
  try {
    const data = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
    const raw = (data?.workflow_run_id ?? data?.run_id ?? (data?.workflow_run as { id?: number } | null)?.id) as unknown;
    return typeof raw === "number" ? raw : null;
  } catch {
    return null;
  }
}

/* ============================================================
 * 对外 handler
 * ============================================================ */

export async function handleCreateSubmission(c: Context<AppEnv>) {
  const allowed = allowedOrigins(c.env.ALLOWED_SITE_ORIGINS);
  const corsHeaders = corsHeadersFor(c.req.header("Origin"), allowed);

  // 1. 限制请求体大小（任务书 §5.5）
  const contentLength = parseInt(c.req.header("Content-Length") || "0", 10);
  if (!isNaN(contentLength) && contentLength > 1024) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "请求体过大");
  }

  let body: any;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "请求体不是有效 JSON");
  }

  // 2. 字段校验
  const repoUrl = (body?.repo_url || "").trim();
  const reason = (body?.reason || "").toString().trim().slice(0, REASON_MAX) || null;
  if (!repoUrl) throw new ApiError(400, "REPO_URL_REQUIRED", "请填写 GitHub 仓库地址");
  if (repoUrl.length > URL_MAX) throw new ApiError(400, "REPO_URL_TOO_LONG", "仓库地址过长");
  if (reason && reason.length > REASON_MAX) {
    throw new ApiError(400, "REASON_TOO_LONG", `推荐理由最多 ${REASON_MAX} 字`);
  }

  const parsed = parseGithubRepo(repoUrl);
  if (!parsed) {
    throw new ApiError(
      400,
      "INVALID_GITHUB_URL",
      "仅支持 https://github.com/owner/repo 格式的公开仓库地址（非 Issue / PR / Gist）",
    );
  }

  // 3. 匿名限流（HMAC 不明文存 IP）
  const ip = extractClientIp(c);
  const requesterHash = await hmacSha256(c.env.COLLECTION_IP_SALT, ip);
  const limit = parseInt(c.env.COLLECTION_RATE_DAILY_PER_IP || "5", 10);
  const used = await countRecentByHash(c.env, requesterHash, IP_LIMIT_WINDOW);
  if (used >= limit) {
    throw new ApiError(429, "IP_DAILY_LIMIT", `过去 24 小时内提交次数已达上限（${limit} 次），请稍后再试`);
  }

  // 4. 同仓库进行中任务去重
  const existing = await findActiveByCanonical(c.env, parsed.canonical);
  if (existing) {
    throw new ApiError(
      409,
      "DUPLICATE_IN_PROGRESS",
      `该工具已经在处理中（${existing.status}），请稍后再查`,
      { submission_id: existing.submission_id, status: existing.status },
    );
  }

  // 5. 创建提交记录
  const id = randomSubmissionId();
  await insertSubmission(c.env, id, {
    repoOwner: parsed.owner,
    repoName: parsed.repo,
    canonical: parsed.canonical,
    repoUrl: repoUrl.replace(/\.git$/i, ""),
    reason,
    requesterHash,
  });

  // 6. 触发 Actions workflow_dispatch
  let runId: number | null = null;
  let dispatchError: string | null = null;
  try {
    runId = await dispatchCollectionWorkflow(c.env, id, parsed.owner, parsed.repo, repoUrl, reason);
    if (runId) await updateSubmissionStatus(c.env, id, "dispatching", "已触发自动校验工作流", undefined, runId, undefined);
    else await updateSubmissionStatus(c.env, id, "dispatching", "已触发自动校验工作流（run_id 待 Actions 回调）");
  } catch (e: any) {
    dispatchError = e?.message || String(e);
    await updateSubmissionStatus(c.env, id, "failed", `触发工作流失败：${dispatchError}`, "WORKFLOW_DISPATCH_FAILED");
  }

  // 7. 返回成功
  return c.json(
    {
      success: true,
      submission_id: id,
      status: dispatchError ? "failed" : "dispatching",
      message: dispatchError
        ? `提交失败：${dispatchError}`
        : "提交成功，自动校验进行中",
      status_url: `${id}`,
      workflow_run_id: runId,
    },
    dispatchError ? 502 : 202,
    corsHeaders,
  );
}

export async function handleGetSubmission(c: Context<AppEnv>) {
  const id = c.req.param("id");
  if (!id || !/^CS-[a-f0-9]{32}$/i.test(id)) {
    throw new ApiError(400, "INVALID_SUBMISSION_ID", "提交编号格式不正确");
  }
  const row = await getSubmission(c.env, id);
  if (!row) {
    throw new ApiError(404, "NOT_FOUND", "未找到该提交记录");
  }
  const now = Date.now();
  return c.json(
    {
      submission_id: row.submission_id,
      status: row.status,
      status_message: row.status_message,
      repo: `${row.repo_owner}/${row.repo_name}`,
      repo_url: row.repo_url,
      failure_code: row.failure_code,
      created_at: new Date(row.created_at * 1000).toISOString(),
      updated_at: new Date(row.updated_at * 1000).toISOString(),
      completed_at: row.completed_at ? new Date(row.completed_at * 1000).toISOString() : null,
      cache_hint: now, // 让前端能分辨"刷新"
    },
    200,
    { "Cache-Control": "no-store" },
  );
}

export async function handleCollectionCallback(c: Context<AppEnv>) {
  // 1. COLLECTION_CALLBACK_SECRET 校验（恒定时间比较）
  const auth = c.req.header("Authorization") || "";
  const expected = `Bearer ${c.env.COLLECTION_CALLBACK_SECRET}`;
  if (!(await timingSafeEqual(auth, expected))) {
    throw new ApiError(401, "CALLBACK_UNAUTHORIZED", "回调凭据无效");
  }

  // 2. 解析 body
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "请求体不是有效 JSON");
  }
  const id = (body?.submission_id || "").toString().trim();
  const status = (body?.status || "").toString().trim();
  const message = (body?.status_message || body?.message || "").toString().trim().slice(0, 300) || null;
  const failureCode = (body?.failure_code || "").toString().trim().slice(0, 60) || null;
  const runIdRaw = body?.workflow_run_id;
  const runId = typeof runIdRaw === "number" ? runIdRaw : null;
  const dupOf = (body?.duplicate_of || "").toString().trim().slice(0, 60) || null;

  if (!id) throw new ApiError(400, "SUBMISSION_ID_REQUIRED", "缺少 submission_id");
  if (!VALID_STATUS.has(status)) {
    throw new ApiError(400, "INVALID_STATUS", `无效状态：${status}`);
  }

  // 3. 查询提交是否存在
  const row = await getSubmission(c.env, id);
  if (!row) {
    // 不返回 404 —— Actions 重试场景下幂等
    return c.json({ success: true, note: "submission not found, ignoring as idempotent" }, 200);
  }

  // 4. 更新状态
  await updateSubmissionStatus(c.env, id, status, message, failureCode, runId, dupOf);

  return c.json(
    {
      success: true,
      submission_id: id,
      status,
      previous: row.status,
    },
    200,
  );
}
