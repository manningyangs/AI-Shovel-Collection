/**
 * 精选推荐服务层（任务书 §五/§八/§十五.1）。
 *
 * 职责：
 *  - 只读加载两个候选池与精选库（raw.githubusercontent，零改写池数据 §四）
 *  - 跨来源合并 → upsert 推荐主记录 + 来源关联（D1）
 *  - 周期评估（GitHub API 预算控制 §十六）→ 评分快照落库
 *  - 推荐状态机写回（§六/§八，promoted 不参与淘汰）
 *  - 公开推荐只读 API（白名单字段 §15.1）
 *
 * 约束：
 *  - 首页零实时 GitHub 请求：本模块只在 Cron/后台运行，结果持久化 D1（§十六）
 *  - 两候选池只读；容量/筛选/淘汰逻辑不在此实现，也绝不被修改（§四）
 */
import type { Context } from "hono";
import type { Env, AppEnv } from "../types";
import { ApiError } from "../types";
import {
  ALGORITHM_VERSION,
  EVAL,
  PUBLIC_LIST_LIMIT,
  PUBLIC_STATUS_SET,
} from "./config";
import {
  buildFacts,
  mergePools,
  nextStatus,
  normalizeRepoSlug,
  runHardCheck,
  scoreRepo,
  type MergedCandidate,
  type PoolAutoRecord,
  type PoolCommunityRecord,
} from "./engine";

const GITHUB_API = "https://api.github.com";
const API_VERSION = "2022-11-28";
/** 系统操作者标识（审计日志 §14.5） */
export const SYSTEM_ACTOR = "system:curation-cron";

export interface PoolData {
  auto: PoolAutoRecord[];
  community: PoolCommunityRecord[];
  catalogSlugs: Set<string>;
  autoCount: number;
  communityCount: number;
}

/* ------------------------------ 池与精选库加载 ------------------------------ */

async function fetchRaw(env: Env, path: string): Promise<Response> {
  const repo = env.GITHUB_API_REPOSITORY;
  const url = `https://raw.githubusercontent.com/${repo}/main/${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "ai-shovel-curation-worker/1.0" },
  });
  if (!res.ok) {
    throw new ApiError(502, "POOL_FETCH_FAILED", `读取数据源失败（${path} → HTTP ${res.status}）`);
  }
  return res;
}

/** 解析 catalog.csv → 标准化 slug 集合（查重用 §5.3） */
export function parseCatalogSlugs(csvRaw: string): Set<string> {
  const out = new Set<string>();
  const lines = csvRaw.replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.startsWith("分类")) continue;
    const parts = line.split(",");
    if (parts.length < 3) continue;
    const slug = normalizeRepoSlug(parts[2].trim());
    if (slug) out.add(slug);
  }
  return out;
}

/**
 * 只读加载：自动发现池 live_multi.candidates（150）+ 社区池 submissions/candidates.json（500）
 * + 精选库 catalog.csv。任何一环失败抛错（Cron 层记录并中止，绝不写半套数据）。
 */
export async function loadPoolData(env: Env): Promise<PoolData> {
  const [liveRes, communityRes, catalogRes] = await Promise.all([
    fetchRaw(env, "live_multi.json"),
    fetchRaw(env, "astro/public/submissions/candidates.json"),
    fetchRaw(env, "catalog.csv"),
  ]);

  const live = (await liveRes.json()) as { candidates?: PoolAutoRecord[] };
  const community = (await communityRes.json()) as {
    candidates?: PoolCommunityRecord[];
    total?: number;
  };
  const catalogRaw = await catalogRes.text();

  const auto = Array.isArray(live.candidates) ? live.candidates : [];
  const communityList = Array.isArray(community.candidates) ? community.candidates : [];

  return {
    auto,
    community: communityList,
    catalogSlugs: parseCatalogSlugs(catalogRaw),
    autoCount: auto.length,
    communityCount: communityList.length,
  };
}

/* ---------------------------- D1：主记录与来源 upsert ---------------------------- */

const CANDIDATE_COLUMNS = `
  candidate_id, repo_slug, repo_url, tool_name, description, status, status_reason,
  total_score, hard_check_status, hard_check_detail, algorithm_version, data_confidence,
  first_recommended_at, last_evaluated_at, promoted_at, catalog_row_key, created_at, updated_at
`;

export interface CurationCandidateRow {
  candidate_id: string;
  repo_slug: string;
  repo_url: string;
  tool_name: string;
  description: string | null;
  status: string;
  status_reason: string | null;
  total_score: number | null;
  hard_check_status: string | null;
  hard_check_detail: string | null;
  algorithm_version: string;
  data_confidence: string | null;
  first_recommended_at: number | null;
  last_evaluated_at: number | null;
  promoted_at: number | null;
  catalog_row_key: string | null;
  created_at: number;
  updated_at: number;
}

function newCandidateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `CUR-${hex}`;
}

/**
 * 同步：合并两池 → upsert 推荐主记录与来源关联。
 * 只写 D1；两个候选池文件保持只读（§4.3 禁止改池）。
 */
export async function syncFromPools(
  env: Env,
  merged: MergedCandidate[],
): Promise<{ created: number; updated: number }> {
  const now = Math.floor(Date.now() / 1000);
  let created = 0;
  let updated = 0;

  for (const m of merged) {
    const existing = await env.DB.prepare(
      `SELECT candidate_id, status FROM curation_candidates WHERE repo_slug = ?`,
    )
      .bind(m.slug)
      .first<{ candidate_id: string; status: string }>();

    let candidateId: string;
    if (existing) {
      candidateId = existing.candidate_id;
      updated++;
      // 基础描述字段随池刷新；状态 / 评分由评估流程写（此处不覆盖）
      await env.DB.prepare(
        `UPDATE curation_candidates
         SET repo_url = ?, tool_name = ?, description = ?, updated_at = ?
         WHERE candidate_id = ?`,
      )
        .bind(m.url, m.title, m.description || null, now, candidateId)
        .run();
    } else {
      candidateId = newCandidateId();
      created++;
      // 新候选初始 pending_review（公开 §7.4），待首次评估后由状态机定级
      await env.DB.prepare(
        `INSERT INTO curation_candidates
           (candidate_id, repo_slug, repo_url, tool_name, description, status,
            algorithm_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'pending_review', ?, ?, ?)`,
      )
        .bind(candidateId, m.slug, m.url, m.title, m.description || null, ALGORITHM_VERSION, now, now)
        .run();
    }

    // 来源关联（多来源，UNIQUE 冲突忽略；不复制池原始数据 §4.3）
    for (const src of m.sources) {
      const ref = src === "community_submission" ? (m.community?.submission_id || m.slug) : m.slug;
      const srcStatus =
        src === "community_submission" ? (m.community?.review_status ?? "pending") : (m.auto?.status ?? "active");
      await env.DB.prepare(
        `INSERT OR IGNORE INTO curation_sources (candidate_id, source_type, source_ref, source_status, linked_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
        .bind(candidateId, src, ref, srcStatus, now)
        .run();
    }
  }

  return { created, updated };
}

/* ------------------------------ GitHub 事实核验（匿名 + 预算） ------------------------------ */

interface ApiFacts {
  exists: boolean;
  description?: string | null;
  topics?: string[];
  language?: string | null;
  licenseSpdx?: string | null;
  stars?: number;
  forks?: number;
  pushedAt?: string | null;
  createdAt?: string | null;
  archived?: boolean;
  fork?: boolean;
  homepage?: string | null;
  sizeKb?: number;
}

type FetchOutcome =
  | { kind: "ok"; facts: ApiFacts }
  | { kind: "not_found" }
  | { kind: "rate_limited" }
  | { kind: "error" };

/**
 * 匿名核验第三方仓库（§十六 Rate Limit：匿名 60 次/时，配合每轮预算）。
 * 不使用 installation token——App 仅安装于本账号，token 查第三方仓库会 404 误判。
 */
async function fetchRepoFacts(slug: string): Promise<FetchOutcome> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${slug}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        "User-Agent": "ai-shovel-curation-worker/1.0",
      },
    });
    if (res.status === 404) return { kind: "not_found" };
    if (res.status === 403 || res.status === 429) return { kind: "rate_limited" };
    if (!res.ok) return { kind: "error" };
    const d = (await res.json()) as Record<string, unknown>;
    return {
      kind: "ok",
      facts: {
        exists: true,
        description: (d.description as string | null) ?? "",
        topics: Array.isArray(d.topics) ? (d.topics as string[]) : [],
        language: (d.language as string | null) ?? null,
        licenseSpdx: ((d.license as { spdx_id?: string } | null)?.spdx_id ?? null) || null,
        stars: typeof d.stargazers_count === "number" ? d.stargazers_count : undefined,
        forks: typeof d.forks_count === "number" ? d.forks_count : undefined,
        pushedAt: (d.pushed_at as string | null) ?? null,
        createdAt: (d.created_at as string | null) ?? null,
        archived: !!d.archived,
        fork: !!d.fork,
        homepage: (d.homepage as string | null) ?? null,
        sizeKb: typeof d.size === "number" ? d.size : undefined,
      },
    };
  } catch {
    return { kind: "error" };
  }
}

/* ------------------------------ 周期评估（§八/§十六） ------------------------------ */

export interface CycleStats {
  trigger: string;
  pools: { auto: number; community: number; catalog: number };
  synced: { created: number; updated: number };
  evaluated: number;
  withApi: number;
  statusChanges: number;
  rateLimited: boolean;
}

/** 判断是否需要调用 GitHub API 补事实：社区池字段较全可直接评；自动发现池缺 stars/license/存在性 */
function needsApi(m: MergedCandidate): boolean {
  if (m.auto && !m.community) return true; // 自动发现池条目：需 API 补 Stars/许可证/存在性
  if (m.community && (m.community.stars == null || m.community.license_spdx == null)) return true;
  return false;
}

/**
 * 一次完整评估周期（Cron / 手动触发共用）：
 *   loadPools（只读）→ sync → 选到期候选 → （预算内）补事实 → 硬性检查+评分 → 状态机 → 落库
 */
export async function runCurationCycle(env: Env, trigger: string): Promise<CycleStats> {
  const pools = await loadPoolData(env);
  const merged = mergePools(pools.auto, pools.community);
  const mergedBySlug = new Map(merged.map((m) => [m.slug, m]));
  const sync = await syncFromPools(env, merged);

  const now = Math.floor(Date.now() / 1000);
  const dueBefore = now - EVAL.REEVAL_INTERVAL_SECONDS;

  const due = await env.DB.prepare(
    `SELECT ${CANDIDATE_COLUMNS} FROM curation_candidates
     WHERE status NOT IN ('promoted', 'rejected')
       AND (last_evaluated_at IS NULL OR last_evaluated_at <= ?)
     ORDER BY (last_evaluated_at IS NULL) DESC, created_at ASC
     LIMIT ?`,
  )
    .bind(dueBefore, EVAL.MAX_CANDIDATES_PER_RUN)
    .all<CurationCandidateRow>();

  const candidates = due.results ?? [];

  // 需要 API 的排前面（优先补齐证据），预算耗尽后用池内数据评（confidence 自然降级）
  const ordered = [...candidates].sort((a, b) => {
    const na = mergedBySlug.get(a.repo_slug);
    const nb = mergedBySlug.get(b.repo_slug);
    const va = na && needsApi(na) ? 0 : 1;
    const vb = nb && needsApi(nb) ? 0 : 1;
    return va - vb;
  });

  let evaluated = 0;
  let withApi = 0;
  let statusChanges = 0;
  let apiBudget = EVAL.MAX_API_CALLS_PER_RUN;
  let rateLimited = false;

  for (const row of ordered) {
    const m = mergedBySlug.get(row.repo_slug);
    if (!m) {
      // 池中已无该记录（历史淘汰）→ 保留推荐记录，仅刷新评估时间不改状态
      await env.DB.prepare(`UPDATE curation_candidates SET last_evaluated_at = ?, updated_at = ? WHERE candidate_id = ?`)
        .bind(now, now, row.candidate_id)
        .run();
      evaluated++;
      continue;
    }

    let apiFacts: ApiFacts | null = null;
    if (!rateLimited && needsApi(m) && apiBudget > 0) {
      apiBudget--;
      const outcome = await fetchRepoFacts(m.slug);
      if (outcome.kind === "ok") {
        apiFacts = outcome.facts;
        withApi++;
      } else if (outcome.kind === "not_found") {
        apiFacts = { exists: false };
        withApi++;
      } else if (outcome.kind === "rate_limited") {
        rateLimited = true; // 本轮停止 API 调用，其余用池内数据评
      }
      // kind=error → 池内数据评（exists unknown）
    }

    const inCatalog = pools.catalogSlugs.has(m.slug);
    const facts = buildFacts(m, apiFacts, inCatalog);

    const hard = runHardCheck(facts);
    const score = scoreRepo(facts);
    const decision = nextStatus(row.status as never, hard, score);

    const scoredAt = Math.floor(Date.now() / 1000);
    const firstPublic =
      decision.status === "recommended" && row.first_recommended_at == null
        ? scoredAt
        : row.first_recommended_at;

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO curation_scores
           (candidate_id, total_score, dimensions, reason, data_confidence, scored_at, algorithm_version)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        row.candidate_id,
        score.total,
        JSON.stringify(score.dimensions),
        score.reason,
        score.dataConfidence,
        scoredAt,
        ALGORITHM_VERSION,
      ),
      env.DB.prepare(
        `UPDATE curation_candidates
         SET status = ?, status_reason = ?, total_score = ?,
             hard_check_status = ?, hard_check_detail = ?,
             algorithm_version = ?, data_confidence = ?,
             first_recommended_at = ?, last_evaluated_at = ?, updated_at = ?
         WHERE candidate_id = ?`,
      ).bind(
        decision.status,
        decision.reason,
        score.total,
        hard.passed ? "pass" : "fail",
        JSON.stringify(hard.checks),
        ALGORITHM_VERSION,
        score.dataConfidence,
        firstPublic,
        scoredAt,
        scoredAt,
        row.candidate_id,
      ),
    ]);

    evaluated++;
    if (decision.changed) {
      statusChanges++;
      await env.DB.prepare(
        `INSERT INTO curation_audit_logs (actor_login, action, target, result, failure_reason, created_at)
         VALUES (?, 'status_change', ?, 'ok', ?, ?)`,
      )
        .bind(SYSTEM_ACTOR, m.slug, `${row.status} → ${decision.status}：${decision.reason}`, scoredAt)
        .run();
    }
  }

  const stats: CycleStats = {
    trigger,
    pools: {
      auto: pools.autoCount,
      community: pools.communityCount,
      catalog: pools.catalogSlugs.size,
    },
    synced: sync,
    evaluated,
    withApi,
    statusChanges,
    rateLimited,
  };

  await env.DB.prepare(
    `INSERT INTO curation_audit_logs (actor_login, action, target, result, failure_reason, request_id, created_at)
     VALUES (?, 'cron_evaluate', ?, ?, ?, ?, ?)`,
  )
    .bind(
      SYSTEM_ACTOR,
      trigger,
      "ok",
      JSON.stringify(stats),
      `${ALGORITHM_VERSION}`,
      Math.floor(Date.now() / 1000),
    )
    .run();

  return stats;
}

/* --------------------------- 公开推荐 API（§15.1 白名单） --------------------------- */

export async function getPublicRecommendations(env: Env) {
  const list = await env.DB.prepare(
    `SELECT ${CANDIDATE_COLUMNS} FROM curation_candidates
     WHERE status IN ('recommended', 'pending_review', 'reviewing', 'approved')
     ORDER BY total_score DESC, last_evaluated_at DESC
     LIMIT ?`,
  )
    .bind(PUBLIC_LIST_LIMIT)
    .all<CurationCandidateRow>();
  const items = list.results ?? [];

  // 统计按公开状态计算（§7.4：不得把已收录/已拒绝/失效算入有效推荐数）
  const statsRes = await env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM curation_candidates GROUP BY status`,
  ).all<{ status: string; n: number }>();
  const byStatus: Record<string, number> = {};
  for (const r of statsRes.results ?? []) byStatus[r.status] = r.n;
  const visible =
    (byStatus.recommended || 0) +
    (byStatus.pending_review || 0) +
    (byStatus.reviewing || 0) +
    (byStatus.approved || 0);

  // 最新评分快照（每候选取 scored_at 最新一条）
  const ids = items.map((i) => i.candidate_id);
  const scoreMap = new Map<string, { dimensions: string; reason: string; scored_at: number; total_score: number }>();
  const srcMap = new Map<string, Array<{ source_type: string; source_status: string | null }>>();
  if (ids.length > 0) {
    const ph = ids.map(() => "?").join(",");
    const [scoresRes, srcRes] = await Promise.all([
      env.DB.prepare(
        `SELECT candidate_id, dimensions, reason, scored_at, total_score FROM curation_scores
         WHERE candidate_id IN (${ph}) ORDER BY scored_at DESC`,
      )
        .bind(...ids)
        .all<{ candidate_id: string; dimensions: string; reason: string; scored_at: number; total_score: number }>(),
      env.DB.prepare(
        `SELECT candidate_id, source_type, source_status FROM curation_sources WHERE candidate_id IN (${ph})`,
      )
        .bind(...ids)
        .all<{ candidate_id: string; source_type: string; source_status: string | null }>(),
    ]);
    for (const s of scoresRes.results ?? []) {
      if (!scoreMap.has(s.candidate_id)) scoreMap.set(s.candidate_id, s); // 已按时间倒序，首个即最新
    }
    for (const s of srcRes.results ?? []) {
      const arr = srcMap.get(s.candidate_id) || [];
      arr.push({ source_type: s.source_type, source_status: s.source_status });
      srcMap.set(s.candidate_id, arr);
    }
  }

  const nowIso = new Date().toISOString();
  return {
    success: true as const,
    algorithm_version: ALGORITHM_VERSION,
    generated_at: nowIso,
    stats: {
      visible,
      recommended: byStatus.recommended || 0,
      pending_review: byStatus.pending_review || 0,
      reviewing: byStatus.reviewing || 0,
      approved: byStatus.approved || 0,
    },
    items: items.map((row) => {
      const snap = scoreMap.get(row.candidate_id);
      let dimensions: unknown = [];
      try {
        dimensions = snap ? JSON.parse(snap.dimensions) : [];
      } catch {
        dimensions = [];
      }
      return {
        repo_slug: row.repo_slug,
        tool_name: row.tool_name,
        description: row.description || "",
        repo_url: row.repo_url,
        total_score: row.total_score,
        dimensions,
        reason: snap?.reason || "",
        sources: (srcMap.get(row.candidate_id) || []).map((s) => s.source_type),
        status: row.status,
        data_confidence: row.data_confidence,
        first_recommended_at: row.first_recommended_at
          ? new Date(row.first_recommended_at * 1000).toISOString()
          : null,
        last_checked_at: row.last_evaluated_at
          ? new Date(row.last_evaluated_at * 1000).toISOString()
          : null,
      };
    }),
  };
}

/** 公开只读接口：GET /api/curation/recommendations（无登录；只回白名单字段 §15.1） */
export async function handleGetRecommendations(c: Context<AppEnv>) {
  const payload = await getPublicRecommendations(c.env);
  return c.json(payload, 200, { "Cache-Control": "public, max-age=300" });
}

/* ------------------------------ Cron 入口（§十六 定期计算） ------------------------------ */

/** Worker scheduled 事件入口：失败记录审计日志，绝不抛穿（避免 Cron 重试风暴） */
export async function handleCurationScheduled(env: Env, cron: string): Promise<void> {
  try {
    const stats = await runCurationCycle(env, `cron:${cron}`);
    console.log(`[curation] cycle ok: ${JSON.stringify(stats)}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[curation] cycle failed: ${msg}`);
    try {
      await env.DB.prepare(
        `INSERT INTO curation_audit_logs (actor_login, action, target, result, failure_reason, created_at)
         VALUES (?, 'cron_evaluate', ?, 'fail', ?, ?)`,
      )
        .bind(SYSTEM_ACTOR, `cron:${cron}`, msg.slice(0, 500), Math.floor(Date.now() / 1000))
        .run();
    } catch {
      // 审计写入再失败 → 只留日志
    }
  }
}

export { PUBLIC_STATUS_SET };
