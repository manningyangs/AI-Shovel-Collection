/**
 * 最终收录（阶段四，任务书 §十二 / §十三 / §15.2「最终收录接口」）。
 *
 * 写入路径（冲突方案 C2）：Worker 不直接改精选库，而是经
 * `workflow_dispatch` 触发独立收录写入工作流 curation-promote.yml，由工作流
 * 在一个提交内原子完成 catalog.csv 三份副本写入 + 社区池记录标记，再显式
 * 派发 live-data / pages 部署；Worker 通过 Contents API 实时核验写入结果。
 *
 * 幂等 / 并发 / 失败恢复（§12.3 / §12.4）：curation_promotions 一行对应一次
 * 收录流程，按状态机推进 writing → written → synced：
 *  - 连续重复请求同一已收录工具 → 直接返回 already（不产生第二次写入）
 *  - 并发点击 → 主键 INSERT 抢占；窗口期内未完成 → 409 IN_PROGRESS
 *  - 写入成功但候选状态同步失败 → 状态停在 written，重试只补 D1 同步
 *  - 触发超时 → 返回 202 writing，由前端轮询/重试继续（只核验不重复触发，
 *    超过 5 分钟无进展才允许重新触发，工作流本身也做精选库查重 → 安全）
 *
 * 最终复核顺序（§12.1）：所有者鉴权 → 精选库查重 → 两池记录检查 → 仓库事实
 * 重新核验 → 硬性资格 → 许可证门槛 → 评分 ≥ 80 → 字段格式 → 审核状态 →
 * 幂等/并发 → 触发写入 → 验证 → 批量状态同步 + 审计日志。
 */
import type { Context } from "hono";
import type { AppEnv, Env, SessionRow } from "../types";
import { ApiError } from "../types";
import { randomBase64Url } from "../security";
import { installationToken } from "../github-app";
import {
  assertUnsafeOrigin,
  loadCandidate,
  requireOwner,
  type CandidateRow,
} from "./admin";
import { ALLOWED_LICENSES, THRESHOLDS } from "./config";
import {
  buildFacts,
  mergePools,
  normalizeRepoSlug,
  runHardCheck,
  scoreRepo,
} from "./engine";
import { fetchRepoFacts, loadPoolData } from "./service";

const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";

/** 写入进行中的「新鲜窗口」（秒）：窗口内重复触发按并发保护拒绝 */
const IN_PROGRESS_WINDOW = 12;
/** 超过该时长仍停在 writing 视为工作流已死，允许重新触发（秒） */
const RESUME_REDISPATCH_AFTER = 300;
/** 触发写入后的就地等待验证（默认 ≈24s；超时转 202，由前端轮询恢复） */
const DEFAULT_VERIFY_ATTEMPTS = 8;
const DEFAULT_VERIFY_INTERVAL_MS = 3000;

/* ------------------------------ 基础工具 ------------------------------ */

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 写入 catalog.csv 的工具名：去换行、去逗号（CSV 列分隔符）后限长 */
export function sanitizeToolName(raw: string): string {
  const cleaned = raw
    .replace(/[\r\n]+/g, " ")
    .replace(/,/g, "、")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 120);
}

/* ------------------------------ 精选库读取 ------------------------------ */

interface CatalogSnapshot {
  raw: string;
  /** 已收录仓库 slug（标准化小写） */
  slugs: Set<string>;
  /** catalog.csv 现有分类（保持文件顺序，供前端选择） */
  categories: string[];
}

/**
 * 经 Contents API 读取 catalog.csv（安装令牌，无 CDN 缓存）。
 * 精选库读取失败一律 fail-closed：查重/分类校验无法完成时绝不触发写入。
 */
async function fetchCatalogSnapshot(env: Env): Promise<CatalogSnapshot> {
  const token = await installationToken(env);
  const res = await fetch(
    `${GITHUB_API}/repos/${env.GITHUB_API_REPOSITORY}/contents/catalog.csv?ref=main`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "ai-shovel-eval-worker",
      },
    },
  );
  if (!res.ok) {
    throw new ApiError(502, "CATALOG_FETCH_FAILED", `无法读取精选库目录（HTTP ${res.status}），已停止收录`);
  }
  const data = (await res.json().catch(() => null)) as
    | { content?: unknown; encoding?: unknown }
    | null;
  if (typeof data?.content !== "string" || data.encoding !== "base64") {
    throw new ApiError(502, "CATALOG_FETCH_FAILED", "精选库目录内容格式异常，已停止收录");
  }
  const raw = decodeBase64Utf8(data.content);
  return { raw, ...parseCatalogRaw(raw) };
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** 解析 catalog.csv → 已收录 slug 集合 + 分类列表（与 service.parseCatalogSlugs 同规则） */
function parseCatalogRaw(raw: string): { slugs: Set<string>; categories: string[] } {
  const slugs = new Set<string>();
  const categories: string[] = [];
  const seenCat = new Set<string>();
  for (const line of raw.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const url = (parts[2] || "").trim();
    if (!url.includes("github.com/")) continue;
    const slug = normalizeRepoSlug(url);
    if (slug) slugs.add(slug.toLowerCase());
    const cat = (parts[0] || "").trim();
    if (cat && !seenCat.has(cat)) {
      seenCat.add(cat);
      categories.push(cat);
    }
  }
  return { slugs, categories };
}

/* ---------------------------- curation_promotions ---------------------------- */

interface PromotionRow {
  candidate_id: string;
  repo_slug: string;
  state: string;
  category: string | null;
  catalog_row_key: string | null;
  workflow_run_id: number | null;
  error: string | null;
  attempts: number;
  created_at: number;
  updated_at: number;
}

async function getPromotion(env: Env, id: string): Promise<PromotionRow | null> {
  const res = await env.DB.prepare(
    `SELECT candidate_id, repo_slug, state, category, catalog_row_key, workflow_run_id,
            error, attempts, created_at, updated_at
     FROM curation_promotions WHERE candidate_id = ?`,
  )
    .bind(id)
    .first<PromotionRow>();
  return res ?? null;
}

/** 抢占式建行：同一候选并发下只有一次 INSERT 成功（§12.3 并发保护） */
async function claimPromotion(
  env: Env,
  id: string,
  slug: string,
  category: string,
): Promise<{ won: boolean; row: PromotionRow | null }> {
  const now = nowSec();
  const insert = await env.DB.prepare(
    `INSERT INTO curation_promotions
       (candidate_id, repo_slug, state, category, attempts, created_at, updated_at)
     VALUES (?, ?, 'writing', ?, 1, ?, ?)
     ON CONFLICT(candidate_id) DO NOTHING`,
  )
    .bind(id, slug, category, now, now)
    .run();

  if (insert.meta.changes > 0) {
    return { won: true, row: await getPromotion(env, id) };
  }
  return { won: false, row: await getPromotion(env, id) };
}

async function markPromotionState(
  env: Env,
  id: string,
  state: string,
  extra: { error?: string | null; workflow_run_id?: number | null } = {},
): Promise<void> {
  await env.DB.prepare(
    `UPDATE curation_promotions
     SET state = ?, error = ?, workflow_run_id = COALESCE(?, workflow_run_id), updated_at = ?
     WHERE candidate_id = ?`,
  )
    .bind(state, extra.error ?? null, extra.workflow_run_id ?? null, nowSec(), id)
    .run();
}

/* ------------------------------ 工作流触发 ------------------------------ */

/** 触发独立收录写入工作流（§12.1.14；§9.3.7 私有仓库用安装令牌） */
async function dispatchPromoteWorkflow(
  env: Env,
  args: { candidateId: string; slug: string; toolName: string; category: string },
): Promise<void> {
  const workflow = env.CURATION_WORKFLOW_FILE || "curation-promote.yml";
  const token = await installationToken(env);
  const res = await fetch(
    `${GITHUB_API}/repos/${env.GITHUB_API_REPOSITORY}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "ai-shovel-eval-worker",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          candidate_id: args.candidateId,
          repo_slug: args.slug,
          tool_name: args.toolName,
          category: args.category,
        },
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new ApiError(
      502,
      "PROMOTE_DISPATCH_FAILED",
      `触发精选写入工作流失败（HTTP ${res.status}）`,
      { detail: detail.slice(0, 300) },
    );
  }
}

/** 触发后就地等待并核验精选库（§12.1.15）；超时返回 false 交由 202 恢复 */
async function verifyCatalogWritten(
  env: Env,
  slug: string,
  catalog: () => Promise<CatalogSnapshot>,
): Promise<boolean> {
  const attempts = Number(env.PROMOTE_VERIFY_ATTEMPTS) || DEFAULT_VERIFY_ATTEMPTS;
  const interval = Number(env.PROMOTE_VERIFY_INTERVAL_MS) || DEFAULT_VERIFY_INTERVAL_MS;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(interval);
    try {
      const snap = await catalog();
      if (snap.slugs.has(slug.toLowerCase())) return true;
    } catch {
      // 核验期间的瞬时失败不判定为写入失败，继续等待
    }
  }
  return false;
}

/* ------------------------------ 复核与同步 ------------------------------ */

interface FinalCheckResult {
  poolFound: { auto: boolean; community: boolean };
  score: number;
  hardReasons: string[];
}

/**
 * §12.1.3-11 的重新核验（写入前强制执行；任何关键检查失败即停止收录）：
 * 两池记录 → 仓库存在性/事实 → 硬性资格 → 许可证收录门槛 → 评分 ≥ 80。
 */
async function runFinalChecks(
  env: Env,
  row: CandidateRow,
  actor: string,
  auditRid: string,
): Promise<FinalCheckResult> {
  const fail = (code: string, message: string, extra?: Record<string, unknown>): never => {
    void auditLog(env, actor, row.candidate_id, message, {
      code,
      request_id: auditRid,
      ...(extra ?? {}),
    });
    throw new ApiError(422, code, message, extra);
  };

  // §12.1.6-7：检查两池中的对应记录（记录来源；不因单池淘汰而阻塞收录）
  const pools = await loadPoolData(env);
  const merged = mergePools(pools.auto, pools.community).find(
    (m) => m.slug === row.repo_slug,
  );
  const poolFound = { auto: !!merged?.auto, community: !!merged?.community };

  // §12.1.8：仓库存在性和最新事实（匿名核验，失败 fail-closed）
  const outcome = await fetchRepoFacts(row.repo_slug);
  if (outcome.kind === "not_found") {
    return fail("REPO_UNAVAILABLE", "收录前核验发现仓库不存在或已被删除，已停止收录", {
      pool: poolFound,
    });
  }
  if (outcome.kind === "rate_limited") {
    return fail("FACTS_RATE_LIMITED", "GitHub 匿名核验配额不足，请稍后重试收录", {});
  }
  if (outcome.kind === "error") {
    return fail("FACTS_FETCH_FAILED", "收录前仓库事实核验失败，已停止收录", {});
  }

  const base = merged ?? {
    slug: row.repo_slug,
    url: row.repo_url,
    title: row.tool_name,
    description: row.description || "",
    auto: null,
    community: null,
    sources: [],
  };
  const facts = buildFacts(base, outcome.facts, false);

  // §12.1.9：硬性资格重新检查
  const hard = runHardCheck(facts);
  if (!hard.passed) {
    return fail("HARD_CHECK_FAILED", "收录前硬性资格检查未通过，已停止收录", {
      checks: hard.checks,
      block_reason: hard.blockReason,
      pool: poolFound,
    });
  }

  // §12.1.11a：许可证收录门槛（缺失→待核实可收录；不在认可列表→阻塞）
  if (facts.licenseSpdx && !ALLOWED_LICENSES.includes(facts.licenseSpdx)) {
    return fail(
      "LICENSE_NOT_ALLOWED",
      `收录前发现许可证变为 ${facts.licenseSpdx}，不符合精选库认可名单，已停止收录`,
      { license_spdx: facts.licenseSpdx, pool: poolFound },
    );
  }

  // §12.1.9b：推荐评分 ≥ 公开推荐门槛（80）
  const score = scoreRepo(facts);
  if (score.total < THRESHOLDS.PUBLIC_MIN) {
    return fail("BELOW_THRESHOLD", `收录前重新评分 ${score.total} 低于门槛 ${THRESHOLDS.PUBLIC_MIN}，已停止收录`, {
      score: score.total,
      threshold: THRESHOLDS.PUBLIC_MIN,
      dimensions: score.dimensions,
      pool: poolFound,
    });
  }

  return { poolFound, score: score.total, hardReasons: hard.blockReason ? [hard.blockReason] : [] };
}

/** 批量同步：候选 → promoted + 推荐状态联动 + 流程状态 synced + 收录日志（§12.1.16-17） */
async function completePromotion(
  env: Env,
  row: CandidateRow,
  category: string,
  promo: PromotionRow | null,
  check: FinalCheckResult | null,
  actor: string,
  auditRid: string,
): Promise<{ promotedAt: number; catalogRowKey: string }> {
  const now = nowSec();
  const finalCategory = promo?.category || category;
  const catalogRowKey =
    promo?.catalog_row_key || (finalCategory ? `${finalCategory}::${row.repo_slug}` : `catalog.csv::${row.repo_slug}`);
  const reason = `已正式写入精选库（${finalCategory || "分类待补"}）`;

  const details = JSON.stringify({
    category: finalCategory,
    catalog_row_key: catalogRowKey,
    ...(check
      ? {
          score: check.score,
          pool_found: check.poolFound,
          hard_reasons: check.hardReasons,
        }
      : { recovery: true }),
  }).slice(0, 1000);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE curation_candidates
       SET status = 'promoted', status_reason = ?, promoted_at = COALESCE(promoted_at, ?),
           catalog_row_key = COALESCE(catalog_row_key, ?), updated_at = ?
       WHERE candidate_id = ?`,
    ).bind(reason, now, catalogRowKey, now, row.candidate_id),
    env.DB.prepare(
      `INSERT INTO curation_promotions
         (candidate_id, repo_slug, state, category, catalog_row_key, attempts, created_at, updated_at)
       VALUES (?, ?, 'synced', ?, ?, 1, ?, ?)
       ON CONFLICT(candidate_id) DO UPDATE SET
         state = 'synced',
         category = COALESCE(curation_promotions.category, excluded.category),
         catalog_row_key = COALESCE(curation_promotions.catalog_row_key, excluded.catalog_row_key),
         error = NULL,
         updated_at = excluded.updated_at`,
    ).bind(row.candidate_id, row.repo_slug, finalCategory, catalogRowKey, now, now),
    env.DB.prepare(
      `UPDATE curation_sources SET source_status = 'promoted' WHERE candidate_id = ?`,
    ).bind(row.candidate_id),
    env.DB.prepare(
      `INSERT INTO curation_audit_logs (actor_login, action, target, result, failure_reason, request_id, created_at)
       VALUES (?, 'promote', ?, 'ok', ?, ?, ?)`,
    ).bind(actor, row.candidate_id, details, auditRid, now),
  ]);

  return { promotedAt: now, catalogRowKey };
}

/** 收录失败审计日志（不阻断主流程；details 随 failure_reason 存档，与 decision 日志同格式） */
async function auditLog(
  env: Env,
  actor: string,
  candidateId: string,
  reason: string,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO curation_audit_logs (actor_login, action, target, result, failure_reason, request_id, created_at)
       VALUES (?, 'promote', ?, 'fail', ?, NULL, ?)`,
    )
      .bind(
        actor,
        candidateId,
        JSON.stringify({ reason, ...(details ?? {}) }).slice(0, 1000),
        nowSec(),
      )
      .run();
  } catch {
    // 审计日志写入失败不覆盖主错误
  }
}

/* ------------------------------ 审核状态门槛 ------------------------------ */

async function assertReviewReady(env: Env, row: CandidateRow): Promise<void> {
  if (row.status !== "approved") {
    throw new ApiError(409, "APPROVAL_REQUIRED", "当前状态不允许收录：需先完成六阶段审核并由所有者确认收录", {
      status: row.status,
    });
  }
  const res = await env.DB.prepare(
    `SELECT stage_index, result FROM curation_reviews WHERE candidate_id = ?`,
  )
    .bind(row.candidate_id)
    .all<{ stage_index: number; result: string | null }>();
  const results = new Map<number, string | null>();
  for (const r of res.results ?? []) results.set(r.stage_index, r.result);

  const missing: number[] = [];
  for (let i = 1; i <= 5; i++) if (!results.get(i)) missing.push(i);
  if (missing.length > 0) {
    throw new ApiError(409, "REVIEW_INCOMPLETE", "六阶段审核尚未完成，不能收录", {
      missing_stages: missing,
    });
  }
  if (results.get(6) !== "pass") {
    throw new ApiError(409, "FINAL_REVIEW_NOT_APPROVED", "仓库所有者最终审核未通过，不能收录", {
      stage_6: results.get(6) ?? null,
    });
  }
}

/* ------------------------------ 接口实现 ------------------------------ */

/** GET /api/curation/admin/candidates/:id/promote：收录前置状态 + 可选分类（§15.2） */
export async function handleGetPromote(c: Context<AppEnv>): Promise<Response> {
  await requireOwner(c);
  const id = c.req.param("id");
  if (!id) throw new ApiError(400, "INVALID_PARAM", "缺少路径参数 id");

  const row = await loadCandidate(c.env, id);
  const [promo, catalog] = await Promise.all([
    getPromotion(c.env, id),
    fetchCatalogSnapshot(c.env),
  ]);

  const reasons: string[] = [];
  if (row.status === "promoted") {
    // 已收录：无前置门槛
  } else if (row.status !== "approved") {
    reasons.push("状态未到 approved（需先完成六阶段并由所有者确认收录）");
  }
  if (row.status === "approved" && row.total_score !== null && row.total_score < THRESHOLDS.PUBLIC_MIN) {
    reasons.push(`最近评分 ${row.total_score} 低于收录门槛 ${THRESHOLDS.PUBLIC_MIN}`);
  }
  if (row.status === "approved") {
    const rev = await c.env.DB.prepare(
      `SELECT stage_index, result FROM curation_reviews WHERE candidate_id = ?`,
    )
      .bind(id)
      .all<{ stage_index: number; result: string | null }>();
    const got = new Map<number, string | null>();
    for (const r of rev.results ?? []) got.set(r.stage_index, r.result);
    const missing: number[] = [];
    for (let i = 1; i <= 5; i++) if (!got.get(i)) missing.push(i);
    if (missing.length) reasons.push(`阶段 ${missing.join("、")} 尚未完成`);
    if (got.has(6) && got.get(6) !== "pass") reasons.push("所有者最终审核未通过");
    else if (!got.has(6)) reasons.push("所有者尚未做出最终审核结论");
  }

  return c.json({
    success: true,
    can_promote: reasons.length === 0,
    blocked_reasons: reasons,
    in_catalog: catalog.slugs.has(row.repo_slug.toLowerCase()),
    categories: catalog.categories,
    status: row.status,
    promoted_at: row.promoted_at,
    catalog_row_key: row.catalog_row_key,
    promotion: promo
      ? {
          state: promo.state,
          category: promo.category,
          error: promo.error,
          attempts: promo.attempts,
          updated_at: new Date(promo.updated_at * 1000).toISOString(),
        }
      : null,
  });
}

/** POST /api/curation/admin/candidates/:id/promote：最终复核并写入精选库（§12） */
export async function handlePromote(c: Context<AppEnv>): Promise<Response> {
  assertUnsafeOrigin(c);
  const session: SessionRow = await requireOwner(c);
  const actor = session.github_login;
  const env = c.env;

  const id = c.req.param("id");
  if (!id) throw new ApiError(400, "INVALID_PARAM", "缺少路径参数 id");
  const body = (await c.req.json().catch(() => null)) as { category?: unknown } | null;
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const auditRid = randomBase64Url(8);

  const row = await loadCandidate(env, id);
  let promo = await getPromotion(env, id);

  /* —— 幂等：已收录且流程已同步 → 直接成功（§12.3 重复点击） —— */
  if (row.status === "promoted" && promo?.state === "synced") {
    return c.json({
      success: true,
      already: true,
      status: "promoted",
      promoted_at: row.promoted_at,
      catalog_row_key: row.catalog_row_key,
      request_id: auditRid,
    });
  }

  /* —— 精选库快照：查重、分类校验、恢复核验的共同依据 —— */
  const catalog = await fetchCatalogSnapshot(env);
  const slugLower = row.repo_slug.toLowerCase();
  const inCatalog = catalog.slugs.has(slugLower);

  if (row.status === "promoted") {
    if (!inCatalog) {
      throw new ApiError(409, "PROMOTION_STATE_CONFLICT", "候选已标记收录但精选库中查不到对应记录，请人工核查", {
        repo_slug: row.repo_slug,
      });
    }
    // 半完成状态修复：状态已 promoted 但流程未 synced → 只补 D1 同步
    const done = await completePromotion(env, row, category, promo, null, actor, auditRid);
    return c.json({
      success: true,
      already: true,
      status: "promoted",
      promoted_at: done.promotedAt,
      catalog_row_key: done.catalogRowKey,
      request_id: auditRid,
    });
  }

  /* —— §12.1.12：审核状态门槛 —— */
  await assertReviewReady(env, row);

  /* —— §12.1.10：必要字段与数据格式 —— */
  const toolName = sanitizeToolName(row.tool_name || "");
  if (!toolName) throw new ApiError(400, "TOOL_NAME_INVALID", "候选缺少有效工具名，无法写入精选库");
  if (!normalizeRepoSlug(row.repo_slug)) {
    throw new ApiError(400, "REPO_SLUG_INVALID", "候选仓库地址不合法，无法写入精选库");
  }

  /* —— 分类：必须属于精选库现有分类（§15.1 单一精选库结构约定） —— */
  if (!category) throw new ApiError(400, "CATEGORY_REQUIRED", "请选择该工具在精选库中的分类");
  if (!catalog.categories.includes(category)) {
    throw new ApiError(400, "CATEGORY_INVALID", "分类不属于精选库现有分类", {
      categories: catalog.categories,
    });
  }

  const now = nowSec();
  const age = promo ? now - promo.updated_at : Number.MAX_SAFE_INTEGER;

  /* —— §12.1.13：幂等与并发（按流程状态机推进） —— */
  let needDispatch = false;
  let needSync = false;

  if (promo?.state === "synced") {
    // 流程已同步但候选状态被改回（人工回退）→ 重新走状态同步即可
    needSync = true;
  } else if (promo?.state === "written") {
    if (!inCatalog) {
      throw new ApiError(409, "PROMOTION_STATE_CONFLICT", "流程记录显示已写入但精选库查不到记录，请人工核查", {
        repo_slug: row.repo_slug,
      });
    }
    needSync = true; // §12.4：写入成功但候选状态同步失败 → 只补同步
  } else if (promo?.state === "writing") {
    if (inCatalog) {
      needSync = true; // 写入已完成、状态未推进 → 恢复路径
    } else if (age < IN_PROGRESS_WINDOW) {
      throw new ApiError(409, "PROMOTION_IN_PROGRESS", "该工具正在写入精选库中，请稍候", {
        state: "writing",
        retry_after_seconds: IN_PROGRESS_WINDOW - age,
      });
    } else if (age < RESUME_REDISPATCH_AFTER) {
      // 工作流可能仍在执行：只核验，不重复触发（§12.4 可恢复的写入步骤）
      const ok = await verifyCatalogWritten(env, row.repo_slug, () =>
        fetchCatalogSnapshot(env),
      );
      if (ok) {
        await markPromotionState(env, id, "written");
        needSync = true;
      } else {
        return c.json(
          {
            success: true,
            state: "writing",
            message: "写入仍在进行，请稍后再次查询",
            request_id: auditRid,
          },
          202,
        );
      }
    } else {
      needDispatch = true; // 超时无进展 → 允许重新触发（工作流内置查重，安全）
    }
  } else {
    // 无流程记录 或 上次失败：精选库已存在 → 直接补状态；否则全量复核后触发写入
    if (inCatalog) {
      needSync = true;
    } else {
      needDispatch = true;
    }
  }

  /* —— §12.1.3-11：写入前的重新复核（仅首次触发/重触发需要） —— */
  let check: FinalCheckResult | null = null;
  if (needDispatch) {
    check = await runFinalChecks(env, row, actor, auditRid);

    const claim = await claimPromotion(env, id, row.repo_slug, category);
    if (!claim.won) {
      const fresh = claim.row && nowSec() - claim.row.updated_at < IN_PROGRESS_WINDOW;
      if (fresh && claim.row?.state === "writing") {
        throw new ApiError(409, "PROMOTION_IN_PROGRESS", "该工具正在写入精选库中，请稍候", {
          state: "writing",
          retry_after_seconds: IN_PROGRESS_WINDOW - (nowSec() - claim.row.updated_at),
        });
      }
      // 其他状态（failed/旧 writing）→ 覆盖为 writing 并继续
      promo = claim.row;
      await markPromotionState(env, id, "writing", { error: null });
      promo = await getPromotion(env, id);
    } else {
      promo = claim.row;
    }

    /* —— §12.1.14：触发独立收录写入工作流 —— */
    try {
      await dispatchPromoteWorkflow(env, {
        candidateId: row.candidate_id,
        slug: row.repo_slug,
        toolName,
        category,
      });
    } catch (e) {
      await markPromotionState(env, id, "failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      await auditLog(env, actor, id, "触发精选写入工作流失败", {
        request_id: auditRid,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }

    /* —— §12.1.15：核验写入 —— */
    const written = await verifyCatalogWritten(env, row.repo_slug, () =>
      fetchCatalogSnapshot(env),
    );
    if (!written) {
      return c.json(
        {
          success: true,
          state: "writing",
          message: "已触发精选库写入，验证进行中，请稍后再次点击或等待页面轮询",
          request_id: auditRid,
        },
        202,
      );
    }
    await markPromotionState(env, id, "written");
    needSync = true;
  }

  /* —— §12.1.16-17：候选状态批量同步 + 完整收录日志 —— */
  if (needSync) {
    const done = await completePromotion(env, row, category, promo, check, actor, auditRid);
    return c.json({
      success: true,
      status: "promoted",
      promoted_at: done.promotedAt,
      catalog_row_key: done.catalogRowKey,
      request_id: auditRid,
    });
  }

  /* —— 防御分支：writing 新鲜窗口内的正常并发请求 —— */
  throw new ApiError(409, "PROMOTION_IN_PROGRESS", "该工具正在写入精选库中，请稍候", {
    state: "writing",
  });
}
