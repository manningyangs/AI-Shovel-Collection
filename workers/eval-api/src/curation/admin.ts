/**
 * /curation 审核工作台后端（任务书 §九 / §十 / §十一 / §15.2）。
 *
 * 会话（冲突方案 C1）：复用现有 OAuth 与 sessions 表；本模块只额外签发
 * HttpOnly Cookie（SameSite=None; Secure，跨站凭据请求）供管理员接口鉴权，
 * 不改动现有评测/提交收录的 sessionStorage + Authorization 逻辑。
 *
 * 所有者鉴权（冲突方案 C5）：session.github_login 与 GitHub API 返回的
 * GITHUB_API_REPOSITORY 仓库 owner.login 比对（服务端可信数据，不接受任何
 * 前端入参/配置字符串单独定权）；GitHub 查询失败一律 fail-closed。
 * 非所有者（协作者/Admin/Maintain/write 等一切账号）一律 403。
 *
 * CSRF：白名单 Origin 中间件全局拦截跨站请求；本模块再强制所有写操作
 * 必须携带白名单内 Origin（浏览器跨域 POST/PUT 必带 Origin，缺失即拒绝）。
 */
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import type { AppEnv, Env, SessionRow } from "../types";
import { ApiError } from "../types";
import { allowedOrigins, randomBase64Url } from "../security";
import { getSession, revokeSession } from "../sessions";
import { installationToken } from "../github-app";

const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";

/** 审核会话 Cookie 名（HttpOnly，浏览器脚本不可读） */
export const CURATION_COOKIE = "shovel_curation_session";

/** 仓库所有者查询结果缓存（同 isolate 内 10 分钟，减少 GitHub API 压力） */
const OWNER_CACHE_TTL = 600;
let ownerCache: { login: string; expiresAt: number } | null = null;

/** 仅测试用：清空模块级所有者缓存 */
export function __resetOwnerCache(): void {
  ownerCache = null;
}

/** 已知候选状态集合（参数校验用，与 engine/CurationStatus 保持一致） */
const KNOWN_STATUSES = new Set([
  "recommended",
  "pending_review",
  "reviewing",
  "approved",
  "promoted",
  "watching",
  "not_recommended",
  "rejected",
  "blocked",
]);

const STAGE_LABELS: Record<number, string> = {
  1: "项目真实性检查",
  2: "功能与用途审核",
  3: "质量与维护审核",
  4: "安全与许可证审核",
  5: "重复与收录资格检查",
  6: "仓库所有者最终审核",
};

/* ------------------------------ 基础工具 ------------------------------ */

function iso(unix: number | null | undefined): string | null {
  return unix ? new Date(unix * 1000).toISOString() : null;
}

function jparse(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** 读取并校验路径参数（Hono 泛型下 param 可能为 undefined） */
function requireParam(c: Context<AppEnv>, name: string): string {
  const v = c.req.param(name);
  if (!v) throw new ApiError(400, "INVALID_PARAM", `缺少路径参数 ${name}`);
  return v;
}

/* ------------------------------ 鉴权与 CSRF ------------------------------ */

/**
 * 通过 GitHub API 获取本仓库（GITHUB_API_REPOSITORY）所有者登录名。
 * 使用 App Installation Token（认证配额 5000/h，不与匿名评分预算竞争）。
 * 查询失败不缓存、直接抛错 → 调用方 fail-closed 拒绝授权。
 */
async function repoOwnerLogin(env: Env): Promise<string> {
  const now = nowSec();
  if (ownerCache && ownerCache.expiresAt > now) return ownerCache.login;

  const [owner, repo] = env.GITHUB_API_REPOSITORY.split("/");
  if (!owner || !repo) throw new ApiError(500, "CONFIG_INVALID", "GITHUB_API_REPOSITORY 配置错误");

  const token = await installationToken(env);
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "ai-shovel-eval-worker",
    },
  });
  if (!res.ok) throw new ApiError(502, "OWNER_LOOKUP_FAILED", `无法查询仓库所有者（HTTP ${res.status}）`);
  const data = (await res.json().catch(() => null)) as { owner?: { login?: unknown } } | null;
  const login = data?.owner?.login;
  if (typeof login !== "string" || !login) {
    throw new ApiError(502, "OWNER_LOOKUP_FAILED", "仓库所有者信息无效");
  }
  ownerCache = { login, expiresAt: now + OWNER_CACHE_TTL };
  return login;
}

/**
 * 管理员接口统一入口：Cookie 会话（401）+ 仓库所有者（403）。
 * 每个接口独立校验（§9.3.8），不共享上一请求的结果。
 */
async function requireOwner(c: Context<AppEnv>): Promise<SessionRow> {
  const token = getCookie(c, CURATION_COOKIE);
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "请先登录审核工作台");
  const session = await getSession(c.env, token);
  if (!session) throw new ApiError(401, "INVALID_SESSION", "登录已过期，请重新登录");

  const owner = await repoOwnerLogin(c.env);
  if (session.github_login.toLowerCase() !== owner.toLowerCase()) {
    throw new ApiError(403, "NOT_OWNER", "只有仓库所有者本人可以执行审核操作", {
      login: session.github_login,
    });
  }
  return session;
}

/** 写操作 CSRF 防护：Origin 必须存在且在白名单内（全局中间件之外的强制校验） */
function assertUnsafeOrigin(c: Context<AppEnv>): void {
  const origin = c.req.header("Origin");
  const allow = allowedOrigins(c.env.ALLOWED_SITE_ORIGINS);
  if (!origin || !allow.includes(origin.replace(/\/+$/, ""))) {
    throw new ApiError(403, "CSRF_ORIGIN_REQUIRED", "请求来源校验失败，请从审核页面发起操作");
  }
}

/* ------------------------- Cookie 会话（C1 升级签发） ------------------------- */

/**
 * POST /api/curation/session
 * 以现有会话 token（sessionStorage 中的 Bearer）换取 HttpOnly Cookie 会话。
 * 不签发新会话、不改现有登录链路；token 无效/过期 → 401（前端回落完整 OAuth）。
 */
export async function handleCookieSession(c: Context<AppEnv>): Promise<Response> {
  assertUnsafeOrigin(c);
  const body = (await c.req.json().catch(() => null)) as { session_token?: unknown } | null;
  const token = typeof body?.session_token === "string" ? body.session_token : "";
  if (!token || token.length > 200) {
    throw new ApiError(400, "MISSING_SESSION_TOKEN", "缺少会话凭证");
  }
  const session = await getSession(c.env, token);
  if (!session) throw new ApiError(401, "INVALID_SESSION", "登录已过期，请重新登录");

  const maxAge = Math.max(60, session.expires_at - nowSec());
  setCookie(c, CURATION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "None",
    path: "/",
    maxAge,
  });
  return c.json({
    success: true,
    user: { login: session.github_login },
    expires_at: iso(session.expires_at),
  });
}

/** POST /api/curation/admin/logout：撤销会话并清除 Cookie（幂等） */
export async function handleAdminLogout(c: Context<AppEnv>): Promise<Response> {
  assertUnsafeOrigin(c);
  const token = getCookie(c, CURATION_COOKIE);
  if (token) {
    try {
      await revokeSession(c.env, token);
    } catch {
      // 登出尽力而为，不影响清除 Cookie
    }
  }
  deleteCookie(c, CURATION_COOKIE, { path: "/" });
  return c.json({ success: true });
}

/* ------------------------------ 身份与列表 ------------------------------ */

/** GET /api/curation/admin/me：会话 + 所有者双重校验；403 extra 携带登录名供 UI 展示 */
export async function handleAdminMe(c: Context<AppEnv>): Promise<Response> {
  const session = await requireOwner(c);
  return c.json({ success: true, user: { login: session.github_login } });
}

interface ListRow {
  candidate_id: string;
  repo_slug: string;
  repo_url: string;
  tool_name: string;
  description: string | null;
  status: string;
  status_reason: string | null;
  total_score: number | null;
  hard_check_status: string | null;
  data_confidence: string | null;
  first_recommended_at: number | null;
  last_evaluated_at: number | null;
  created_at: number;
  updated_at: number;
}

/** GET /api/curation/admin/candidates：审核任务列表（仅所有者） */
export async function handleListCandidates(c: Context<AppEnv>): Promise<Response> {
  await requireOwner(c);
  const env = c.env;

  const status = c.req.query("status");
  const q = (c.req.query("q") || "").trim().slice(0, 100);
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit")) || 50));
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);

  if (status && status !== "all" && !KNOWN_STATUSES.has(status)) {
    throw new ApiError(400, "INVALID_STATUS", "status 参数不合法");
  }

  const where: string[] = [];
  const binds: unknown[] = [];
  if (!status) {
    where.push(`status != 'promoted'`); // 默认隐藏已收录（历史另行筛选）
  } else if (status !== "all") {
    where.push("status = ?");
    binds.push(status);
  }
  if (q) {
    where.push("(repo_slug LIKE ? OR tool_name LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [listRes, countRes] = await Promise.all([
    env.DB.prepare(
      `SELECT candidate_id, repo_slug, repo_url, tool_name, description, status, status_reason,
              total_score, hard_check_status, data_confidence,
              first_recommended_at, last_evaluated_at, created_at, updated_at
       FROM curation_candidates ${whereSql}
       ORDER BY total_score DESC, updated_at DESC
       LIMIT ? OFFSET ?`,
    )
      .bind(...binds, limit, offset)
      .all<ListRow>(),
    env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM curation_candidates GROUP BY status`,
    ).all<{ status: string; n: number }>(),
  ]);

  const items = listRes.results ?? [];
  const byStatus: Record<string, number> = {};
  for (const r of countRes.results ?? []) byStatus[r.status] = r.n;

  // 审核进度与来源（批量查询，避免 N+1）
  const reviewMap = new Map<string, Record<number, string>>();
  const sourceMap = new Map<string, string[]>();
  const ids = items.map((i) => i.candidate_id);
  if (ids.length > 0) {
    const ph = ids.map(() => "?").join(",");
    const [revRes, srcRes] = await Promise.all([
      env.DB.prepare(
        `SELECT candidate_id, stage_index, result FROM curation_reviews
         WHERE candidate_id IN (${ph}) AND result IS NOT NULL`,
      )
        .bind(...ids)
        .all<{ candidate_id: string; stage_index: number; result: string }>(),
      env.DB.prepare(
        `SELECT candidate_id, source_type FROM curation_sources WHERE candidate_id IN (${ph})`,
      )
        .bind(...ids)
        .all<{ candidate_id: string; source_type: string }>(),
    ]);
    for (const r of revRes.results ?? []) {
      const m = reviewMap.get(r.candidate_id) || {};
      m[r.stage_index] = r.result;
      reviewMap.set(r.candidate_id, m);
    }
    for (const s of srcRes.results ?? []) {
      const arr = sourceMap.get(s.candidate_id) || [];
      if (!arr.includes(s.source_type)) arr.push(s.source_type);
      sourceMap.set(s.candidate_id, arr);
    }
  }

  return c.json({
    success: true,
    counts: byStatus,
    total: items.length,
    items: items.map((row) => {
      const stages = reviewMap.get(row.candidate_id) || {};
      return {
        candidate_id: row.candidate_id,
        repo_slug: row.repo_slug,
        repo_url: row.repo_url,
        tool_name: row.tool_name,
        description: row.description || "",
        status: row.status,
        status_reason: row.status_reason,
        total_score: row.total_score,
        hard_check_status: row.hard_check_status,
        data_confidence: row.data_confidence,
        sources: sourceMap.get(row.candidate_id) || [],
        first_recommended_at: iso(row.first_recommended_at),
        last_evaluated_at: iso(row.last_evaluated_at),
        updated_at: iso(row.updated_at),
        review: {
          completed: Object.keys(stages).length,
          results: stages,
        },
      };
    }),
  });
}

/* ------------------------------ 详情（完整证据） ------------------------------ */

interface CandidateRow extends ListRow {
  status_reason: string | null;
  hard_check_detail: string | null;
  algorithm_version: string;
  promoted_at: number | null;
  catalog_row_key: string | null;
}

const DETAIL_COLUMNS = `
  candidate_id, repo_slug, repo_url, tool_name, description, status, status_reason,
  total_score, hard_check_status, hard_check_detail, algorithm_version, data_confidence,
  first_recommended_at, last_evaluated_at, promoted_at, catalog_row_key, created_at, updated_at
`;

async function loadCandidate(env: Env, id: string): Promise<CandidateRow> {
  const row = await env.DB.prepare(
    `SELECT ${DETAIL_COLUMNS} FROM curation_candidates WHERE candidate_id = ?`,
  )
    .bind(id)
    .first<CandidateRow>();
  if (!row) throw new ApiError(404, "CANDIDATE_NOT_FOUND", "候选记录不存在");
  return row;
}

/** GET /api/curation/admin/candidates/:id：评分依据 + 硬检证据 + 六阶段 + 日志（仅所有者） */
export async function handleGetCandidateDetail(c: Context<AppEnv>): Promise<Response> {
  await requireOwner(c);
  const env = c.env;
  const id = requireParam(c, "id");
  const row = await loadCandidate(env, id);

  const [srcRes, scoreRes, revRes, logRes] = await Promise.all([
    env.DB.prepare(
      `SELECT source_type, source_ref, source_status, linked_at FROM curation_sources
       WHERE candidate_id = ? ORDER BY id ASC`,
    )
      .bind(id)
      .all<{ source_type: string; source_ref: string; source_status: string | null; linked_at: number }>(),
    env.DB.prepare(
      `SELECT total_score, dimensions, reason, data_confidence, scored_at, algorithm_version
       FROM curation_scores WHERE candidate_id = ? ORDER BY scored_at DESC LIMIT 10`,
    )
      .bind(id)
      .all<{
        total_score: number;
        dimensions: string;
        reason: string;
        data_confidence: string;
        scored_at: number;
        algorithm_version: string;
      }>(),
    env.DB.prepare(
      `SELECT stage_index, result, evidence, checked_at, reviewer_note, updated_at
       FROM curation_reviews WHERE candidate_id = ? ORDER BY stage_index ASC`,
    )
      .bind(id)
      .all<{
        stage_index: number;
        result: string | null;
        evidence: string | null;
        checked_at: number | null;
        reviewer_note: string | null;
        updated_at: number;
      }>(),
    env.DB.prepare(
      `SELECT actor_login, action, target, result, failure_reason, request_id, created_at
       FROM curation_audit_logs
       WHERE target IN (?, ?) ORDER BY created_at DESC, id DESC LIMIT 50`,
    )
      .bind(id, row.repo_slug)
      .all<{
        actor_login: string | null;
        action: string;
        target: string;
        result: string;
        failure_reason: string | null;
        request_id: string | null;
        created_at: number;
      }>(),
  ]);

  const scores = scoreRes.results ?? [];
  const latest = scores[0] || null;
  const reviews = (revRes.results ?? []).map((r) => ({
    stage_index: r.stage_index,
    stage_label: STAGE_LABELS[r.stage_index] || `阶段 ${r.stage_index}`,
    result: r.result,
    evidence: jparse(r.evidence),
    checked_at: iso(r.checked_at),
    reviewer_note: r.reviewer_note,
    updated_at: iso(r.updated_at),
    // §11：候选重新评估晚于人工检查 → 标记结果可能过期
    stale: !!(r.checked_at && row.last_evaluated_at && r.checked_at < row.last_evaluated_at),
  }));

  const completed1to5 = reviews.filter((r) => r.stage_index <= 5 && r.result != null).length;

  return c.json({
    success: true,
    candidate: {
      candidate_id: row.candidate_id,
      repo_slug: row.repo_slug,
      repo_url: row.repo_url,
      tool_name: row.tool_name,
      description: row.description || "",
      status: row.status,
      status_reason: row.status_reason,
      total_score: row.total_score,
      hard_check_status: row.hard_check_status,
      hard_check: jparse(row.hard_check_detail),
      algorithm_version: row.algorithm_version,
      data_confidence: row.data_confidence,
      first_recommended_at: iso(row.first_recommended_at),
      last_evaluated_at: iso(row.last_evaluated_at),
      promoted_at: iso(row.promoted_at),
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
    },
    sources: (srcRes.results ?? []).map((s) => ({
      source_type: s.source_type,
      source_ref: s.source_ref,
      source_status: s.source_status,
      linked_at: iso(s.linked_at),
    })),
    latest_score: latest
      ? {
          total_score: latest.total_score,
          dimensions: jparse(latest.dimensions) || [],
          reason: latest.reason,
          data_confidence: latest.data_confidence,
          scored_at: iso(latest.scored_at),
          algorithm_version: latest.algorithm_version,
        }
      : null,
    score_history: scores.map((s) => ({
      total_score: s.total_score,
      data_confidence: s.data_confidence,
      scored_at: iso(s.scored_at),
      algorithm_version: s.algorithm_version,
      reason: s.reason,
    })),
    reviews,
    can_decide: completed1to5 >= 5,
    audit_logs: (logRes.results ?? []).map((l) => ({
      actor_login: l.actor_login,
      action: l.action,
      target: l.target,
      result: l.result,
      details: jparse(l.failure_reason),
      request_id: l.request_id,
      created_at: iso(l.created_at),
    })),
  });
}

/* --------------------------- 六阶段审核写入（§十/§十一） --------------------------- */

interface ReviewBody {
  result?: string | null;
  evidence?: unknown;
  reviewer_note?: string | null;
}

const VALID_RESULTS = new Set(["pass", "warn", "fail"]);

/** PUT /api/curation/admin/candidates/:id/reviews/:stage —— 持久化单阶段结果（可中断恢复） */
export async function handleSaveReview(c: Context<AppEnv>): Promise<Response> {
  assertUnsafeOrigin(c);
  const session = await requireOwner(c);
  const env = c.env;

  const stageRaw = c.req.param("stage");
  const stage = Number(stageRaw);
  if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
    throw new ApiError(400, "INVALID_STAGE", "阶段编号必须为 1-6");
  }

  const body = (await c.req.json().catch(() => null)) as ReviewBody | null;
  if (!body || typeof body !== "object") throw new ApiError(400, "INVALID_BODY", "请求体不合法");

  const hasResult = "result" in body;
  const hasEvidence = "evidence" in body;
  const hasNote = "reviewer_note" in body;
  if (!hasResult && !hasEvidence && !hasNote) {
    throw new ApiError(400, "NOTHING_TO_UPDATE", "缺少需要保存的字段");
  }

  if (
    hasResult &&
    body.result !== null &&
    (typeof body.result !== "string" || !VALID_RESULTS.has(body.result))
  ) {
    throw new ApiError(400, "INVALID_RESULT", "result 必须为 pass / warn / fail");
  }

  let evidenceStr: string | null = null;
  if (hasEvidence && body.evidence != null) {
    evidenceStr = JSON.stringify(body.evidence);
    if (evidenceStr.length > 6000) throw new ApiError(400, "EVIDENCE_TOO_LARGE", "证据内容过长（≤6000 字符）");
  }

  let note: string | null = null;
  if (hasNote && body.reviewer_note != null) {
    if (typeof body.reviewer_note !== "string") throw new ApiError(400, "INVALID_NOTE", "审核意见必须为字符串");
    note = body.reviewer_note.slice(0, 2000);
  }

  const row = await loadCandidate(env, requireParam(c, "id"));
  if (row.status === "promoted") throw new ApiError(409, "CANDIDATE_PROMOTED", "该候选已正式收录，不可再修改审核记录");

  const existing = await env.DB.prepare(
    `SELECT result, evidence, checked_at, reviewer_note FROM curation_reviews
     WHERE candidate_id = ? AND stage_index = ?`,
  )
    .bind(row.candidate_id, stage)
    .first<{ result: string | null; evidence: string | null; checked_at: number | null; reviewer_note: string | null }>();

  const now = nowSec();
  const nextResult = hasResult ? (body.result ?? null) : existing?.result ?? null;
  const nextChecked = hasResult ? (body.result ? now : null) : existing?.checked_at ?? null;
  const nextEvidence = hasEvidence ? evidenceStr : existing?.evidence ?? null;
  const nextNote = hasNote ? note : existing?.reviewer_note ?? null;

  // 首次人工检查推进状态机：recommended/pending_review → reviewing（§六，受后端约束）
  const transition =
    hasResult && body.result && (row.status === "recommended" || row.status === "pending_review");

  const newStatus = transition ? "reviewing" : row.status;
  const newReason = transition ? `${session.github_login} 开始六阶段审核` : row.status_reason;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO curation_reviews (candidate_id, stage_index, result, evidence, checked_at, reviewer_note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(candidate_id, stage_index) DO UPDATE SET
         result = excluded.result,
         evidence = excluded.evidence,
         checked_at = excluded.checked_at,
         reviewer_note = excluded.reviewer_note,
         updated_at = excluded.updated_at`,
    ).bind(row.candidate_id, stage, nextResult, nextEvidence, nextChecked, nextNote, now),
    ...(transition
      ? [
          env.DB.prepare(
            `UPDATE curation_candidates SET status = ?, status_reason = ?, updated_at = ? WHERE candidate_id = ?`,
          ).bind(newStatus, newReason, now, row.candidate_id),
        ]
      : []),
    env.DB.prepare(
      `INSERT INTO curation_audit_logs (actor_login, action, target, result, failure_reason, request_id, created_at)
       VALUES (?, 'review', ?, 'ok', ?, ?, ?)`,
    ).bind(
      session.github_login,
      row.candidate_id,
      JSON.stringify({
        stage,
        stage_label: STAGE_LABELS[stage],
        result: nextResult,
        note: nextNote,
        ...(transition ? { status: `${row.status} → reviewing` } : {}),
      }).slice(0, 1000),
      randomBase64Url(8),
      now,
    ),
  ]);

  return c.json({
    success: true,
    review: {
      stage_index: stage,
      result: nextResult,
      evidence: jparse(nextEvidence),
      checked_at: iso(nextChecked),
      reviewer_note: nextNote,
      updated_at: iso(now),
    },
    status: newStatus,
    status_reason: newReason,
  });
}

/* ------------------------- 第六阶段：最终决策（§10.6） ------------------------- */

const DECISIONS: Record<string, { status: string; stage6: string; label: string }> = {
  approve: { status: "approved", stage6: "pass", label: "确认收录" },
  hold: { status: "reviewing", stage6: "warn", label: "暂不收录" },
  reject: { status: "rejected", stage6: "fail", label: "拒绝收录" },
  return: { status: "pending_review", stage6: "warn", label: "退回重新审核" },
};

/** POST /api/curation/admin/candidates/:id/decision —— 所有者最终决策（写状态 + 阶段六 + 审计） */
export async function handleDecision(c: Context<AppEnv>): Promise<Response> {
  assertUnsafeOrigin(c);
  const session = await requireOwner(c);
  const env = c.env;

  const body = (await c.req.json().catch(() => null)) as { action?: unknown; note?: unknown } | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const decision = DECISIONS[action];
  if (!decision) throw new ApiError(400, "INVALID_ACTION", "action 必须为 approve / hold / reject / return");

  let note: string | null = null;
  if (body?.note != null) {
    if (typeof body.note !== "string") throw new ApiError(400, "INVALID_NOTE", "审核意见必须为字符串");
    note = body.note.slice(0, 2000);
  }

  const row = await loadCandidate(env, requireParam(c, "id"));
  if (row.status === "promoted") throw new ApiError(409, "CANDIDATE_PROMOTED", "该候选已正式收录");

  // 批准前置：六阶段前五阶段必须全部完成（§10 线性审核；失败与否由所有者判断，阶段四最终复核兜底）
  if (action === "approve") {
    const revRes = await env.DB.prepare(
      `SELECT stage_index FROM curation_reviews
       WHERE candidate_id = ? AND stage_index <= 5 AND result IS NOT NULL`,
    )
      .bind(row.candidate_id)
      .all<{ stage_index: number }>();
    const done = new Set((revRes.results ?? []).map((r) => r.stage_index));
    const missing = [1, 2, 3, 4, 5].filter((i) => !done.has(i));
    if (missing.length > 0) {
      throw new ApiError(409, "REVIEW_INCOMPLETE", "前五个审核阶段尚未全部完成，不能确认收录", {
        missing_stages: missing,
      });
    }
  }

  const now = nowSec();
  const reason = note
    ? `${decision.label}：${note}`
    : action === "approve"
      ? "所有者确认收录，等待正式写入精选库"
      : decision.label;
  const requestId = randomBase64Url(8);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE curation_candidates SET status = ?, status_reason = ?, updated_at = ? WHERE candidate_id = ?`,
    ).bind(decision.status, reason, now, row.candidate_id),
    // 阶段六落库（结果 + 决策意见 + 审计）
    env.DB.prepare(
      `INSERT INTO curation_reviews (candidate_id, stage_index, result, evidence, checked_at, reviewer_note, updated_at)
       VALUES (?, 6, ?, ?, ?, ?, ?)
       ON CONFLICT(candidate_id, stage_index) DO UPDATE SET
         result = excluded.result,
         evidence = excluded.evidence,
         checked_at = excluded.checked_at,
         reviewer_note = excluded.reviewer_note,
         updated_at = excluded.updated_at`,
    ).bind(row.candidate_id, decision.stage6, JSON.stringify({ action, label: decision.label }), now, note, now),
    env.DB.prepare(
      `INSERT INTO curation_audit_logs (actor_login, action, target, result, failure_reason, request_id, created_at)
       VALUES (?, 'decision', ?, 'ok', ?, ?, ?)`,
    ).bind(
      session.github_login,
      row.candidate_id,
      JSON.stringify({
        action,
        label: decision.label,
        from: row.status,
        to: decision.status,
        note,
      }).slice(0, 1000),
      requestId,
      now,
    ),
  ]);

  return c.json({
    success: true,
    action,
    status: decision.status,
    status_reason: reason,
    request_id: requestId,
  });
}
