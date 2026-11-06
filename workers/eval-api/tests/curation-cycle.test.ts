/**
 * 精选推荐周期评估集成测试（阶段一验收 §三）：
 *  本地 miniflare D1 + 真实池文件（只读）+ mock GitHub API，跑通完整 Cycle：
 *   两池独立加载（150/500 只读）→ 跨池去重 upsert → 硬性检查 → 评分落库 → 状态机
 *  → 二次运行幂等（只处理到期候选 §十六）→ promoted 不参与淘汰（§八.6）
 *
 * 注意：本测试从不写两个候选池文件（只读加载后在内存注入一条双来源记录用于去重断言）。
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Miniflare } from "miniflare";
import { mergePools, type PoolAutoRecord, type PoolCommunityRecord } from "../src/curation/engine";
import { runCurationCycle, loadPoolData, getPublicRecommendations, type CycleStats } from "../src/curation/service";
import type { Env } from "../src/types";

const ROOT = path.resolve(process.cwd(), "../.."); // repo/
const LIVE_PATH = path.join(ROOT, "astro/public/live_multi.json");
const COMMUNITY_PATH = path.join(ROOT, "astro/public/submissions/candidates.json");
const CATALOG_PATH = path.join(ROOT, "catalog.csv");

const REPO_RAW = "https://raw.githubusercontent.com/manningyangs/AI-Shovel-Collection/main";

/** 注入一条同时存在于两池的记录（真实两池交集为空时也能验证跨来源去重） */
const DUP_SLUG = "ztest-dup/curation-fixture";

function githubResponse() {
  return new Response(
    JSON.stringify({
      description: "An AI agent tool for automating developer workflows with LLM and MCP support",
      topics: ["ai", "llm", "agent", "mcp"],
      language: "TypeScript",
      license: { spdx_id: "MIT" },
      stargazers_count: 1200,
      forks_count: 80,
      pushed_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      created_at: "2023-06-01T00:00:00Z",
      archived: false,
      fork: false,
      homepage: "https://example.com",
      size: 512,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("curation cycle 集成（阶段一验收）", () => {
  let mf: Miniflare;
  let db: D1Database;
  let env: Env;
  let liveRaw: string;
  let communityRaw: string;
  let catalogRaw: string;
  let autoRecords: PoolAutoRecord[];
  let communityRecords: PoolCommunityRecord[];
  let expectedMerged: number;

  beforeAll(async () => {
    liveRaw = readFileSync(LIVE_PATH, "utf8");
    communityRaw = readFileSync(COMMUNITY_PATH, "utf8");
    catalogRaw = readFileSync(CATALOG_PATH, "utf8");

    const live = JSON.parse(liveRaw) as { candidates?: PoolAutoRecord[] };
    const community = JSON.parse(communityRaw) as { candidates?: PoolCommunityRecord[] };
    autoRecords = [...(live.candidates || [])];
    communityRecords = [...(community.candidates || [])];

    // 内存注入双来源记录（不触碰池文件）
    autoRecords.push({
      repo_slug: DUP_SLUG,
      repo_url: `https://github.com/${DUP_SLUG}`,
      title: DUP_SLUG,
      desc: "Injected fixture present in both pools for dedup verification",
      extra: { confidence: 9 },
    });
    communityRecords.push({
      submission_id: "s-test-dup",
      repo_slug: DUP_SLUG,
      repo_url: `https://github.com/${DUP_SLUG}`,
      title: DUP_SLUG,
      description: "Injected fixture present in both pools for dedup verification",
      license_spdx: "MIT",
      stars: 300,
      forks: 20,
      topics: ["ai", "agent"],
      pushed_at: new Date(Date.now() - 10 * 86400000).toISOString(),
      created_at: "2024-01-01T00:00:00Z",
    });

    const pool = { auto: autoRecords, community: communityRecords };
    expectedMerged = mergePools(pool.auto, pool.community).length;
    // stub 返回注入后的池数据（文件原文仅用于字节不变比对）
    const liveStub = JSON.stringify({ ...(JSON.parse(liveRaw) as object), candidates: autoRecords });
    const communityStub = JSON.stringify({ ...(JSON.parse(communityRaw) as object), candidates: communityRecords });

    // mock fetch：raw 池数据 → 池内容（含注入 fixture）；GitHub API → 合成高分数据
    vi.stubGlobal("fetch", async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.startsWith(`${REPO_RAW}/live_multi.json`)) return new Response(liveStub, { status: 200 });
      if (url.startsWith(`${REPO_RAW}/astro/public/submissions/candidates.json`)) return new Response(communityStub, { status: 200 });
      if (url.startsWith(`${REPO_RAW}/catalog.csv`)) return new Response(catalogRaw, { status: 200 });
      if (url.startsWith("https://api.github.com/repos/")) return githubResponse();
      return new Response("not found", { status: 404 });
    });

    mf = new Miniflare({
      modules: true,
      script: "export default { async fetch() { return new Response('ok'); } }",
      d1Databases: { DB: "curation-test" },
    });
    db = await mf.getD1Database("DB");

    // 应用全部迁移（含 0003，验证 SQL 语法有效）：
    // 剥离 -- 注释后按分号逐句执行（miniflare 的 D1 exec 对注释/分割处理不稳）
    for (const f of ["0001_initial_schema.sql", "0002_collection_submissions.sql", "0003_curation.sql"]) {
      const sql = readFileSync(path.join(process.cwd(), "migrations", f), "utf8").replace(/--[^\n]*/g, "");
      const stmts = sql.split(";").map((s) => s.trim()).filter(Boolean);
      for (const st of stmts) {
        await db.prepare(st).run();
      }
    }

    env = {
      DB: db,
      GITHUB_API_REPOSITORY: "manningyangs/AI-Shovel-Collection",
    } as unknown as Env;
  }, 120000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    await mf?.dispose();
  });

  it("Cycle 1：两池只读加载（150/500 上限内）+ 评分与状态落库", async () => {
    const stats: CycleStats = await runCurationCycle(env, "test:cycle-1");

    // §4.1 两池独立加载（注入 1 条 fixture 后的数量；池文件本身只读不改）
    expect(stats.pools.auto).toBe(autoRecords.length);
    expect(stats.pools.community).toBe(communityRecords.length);
    expect(stats.pools.auto).toBeGreaterThan(0);
    expect(stats.pools.community).toBeGreaterThan(0);
    // 池文件字节内容未被改动 + 真实容量在上限内
    expect(readFileSync(LIVE_PATH, "utf8")).toBe(liveRaw);
    expect(readFileSync(COMMUNITY_PATH, "utf8")).toBe(communityRaw);
    expect((JSON.parse(liveRaw) as { candidates: unknown[] }).candidates.length).toBeLessThanOrEqual(150);
    expect((JSON.parse(communityRaw) as { candidates: unknown[] }).candidates.length).toBeLessThanOrEqual(500);

    // 同一仓库一条主记录（跨来源去重 §5.2）
    const total = (await db.prepare("SELECT COUNT(*) AS n FROM curation_candidates").first<{ n: number }>())!.n;
    expect(total).toBe(expectedMerged);

    const dups = await db
      .prepare("SELECT repo_slug, COUNT(*) AS n FROM curation_candidates GROUP BY repo_slug HAVING n > 1")
      .all<{ repo_slug: string; n: number }>();
    expect(dups.results).toHaveLength(0);

    // 注入记录 → 双来源挂同一条主记录
    const dupRow = await db
      .prepare("SELECT candidate_id FROM curation_candidates WHERE repo_slug = ?")
      .bind(DUP_SLUG)
      .first<{ candidate_id: string }>();
    expect(dupRow).not.toBeNull();
    const dupSrc = await db
      .prepare("SELECT source_type FROM curation_sources WHERE candidate_id = ? ORDER BY source_type")
      .bind(dupRow!.candidate_id)
      .all<{ source_type: string }>();
    expect(dupSrc.results.map((r) => r.source_type)).toEqual(["auto_discovery", "community_submission"]);

    // 评分快照可追溯（§5.5：每次评估写 scores）
    const scores = (await db.prepare("SELECT COUNT(*) AS n FROM curation_scores").first<{ n: number }>())!.n;
    expect(scores).toBe(stats.evaluated);
    expect(stats.evaluated).toBeGreaterThan(0);

    // API 预算生效（§十六）
    expect(stats.withApi).toBeLessThanOrEqual(40);

    // 有公开推荐（mock API 高分 → recommended）且有观察态（证据不足降级 §5.5）
    const byStatus = await db.prepare("SELECT status, COUNT(*) AS n FROM curation_candidates GROUP BY status").all<{
      status: string;
      n: number;
    }>();
    const map = Object.fromEntries((byStatus.results || []).map((r) => [r.status, r.n]));
    expect(map.recommended || 0).toBeGreaterThan(0);
    expect(map.watching || 0).toBeGreaterThan(0);

    // 已在精选库的条目 → blocked（查重幂等 §12.1.5）
    const catalog = new Set(
      catalogRaw
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.startsWith("分类"))
        .map((l) => l.split(",")[2]?.trim())
        .filter(Boolean)
        .map((u) =>
          u
            .toLowerCase()
            .replace(/^https?:\/\/(www\.)?github\.com\//, "")
            .replace(/\.git$/, "")
            .replace(/\/$/, ""),
        ),
    );
    const catalogHits = [...catalog].filter((s) => {
      // 与两池交集
      return autoRecords.some((a) => (a.repo_slug || "").toLowerCase() === s);
    });
    if (catalogHits.length > 0) {
      const blocked = await db
        .prepare("SELECT COUNT(*) AS n FROM curation_candidates WHERE repo_slug = ? AND status = 'blocked'")
        .bind(catalogHits[0])
        .first<{ n: number }>();
      expect(blocked!.n).toBe(1);
    }

    // 审计日志（§14.5）
    const audit = await db
      .prepare("SELECT COUNT(*) AS n FROM curation_audit_logs WHERE action = 'cron_evaluate' AND result = 'ok'")
      .first<{ n: number }>();
    expect(audit!.n).toBe(1);

    // 推荐理由非空且包含评分信息（§7.3）
    const withReason = await db
      .prepare("SELECT reason FROM curation_scores WHERE candidate_id = ? ORDER BY scored_at DESC LIMIT 1")
      .bind(dupRow!.candidate_id)
      .first<{ reason: string }>();
    expect(withReason!.reason).toContain("分");
  }, 300000);

  it("Cycle 2：立即重跑 → 已评估候选不重复计算（§十六 增量更新），upsert 幂等", async () => {
    const beforeTotal = (await db.prepare("SELECT COUNT(*) AS n FROM curation_candidates").first<{ n: number }>())!.n;
    const beforeScores = (await db.prepare("SELECT COUNT(*) AS n FROM curation_scores").first<{ n: number }>())!.n;

    const stats = await runCurationCycle(env, "test:cycle-2");

    const afterTotal = (await db.prepare("SELECT COUNT(*) AS n FROM curation_candidates").first<{ n: number }>())!.n;
    const afterScores = (await db.prepare("SELECT COUNT(*) AS n FROM curation_scores").first<{ n: number }>())!.n;

    // upsert 幂等：主记录不增不减
    expect(afterTotal).toBe(beforeTotal);
    expect(stats.synced.created).toBe(0);
    // 已评估候选（24h 内）不再重复评分；仅未评过的继续（每轮上限 120）
    expect(afterScores - beforeScores).toBe(stats.evaluated);
    expect(stats.evaluated).toBeLessThanOrEqual(120);
    // 重复来源关联不重复插入（UNIQUE）
    const dupSrcCount = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM curation_sources s
         JOIN curation_candidates c ON c.candidate_id = s.candidate_id
         WHERE c.repo_slug = ?`,
      )
      .bind(DUP_SLUG)
      .first<{ n: number }>();
    expect(dupSrcCount!.n).toBe(2);
  }, 300000);

  it("promoted 候选：不参与评估与淘汰（§八.6），评分跌破门榄不影响已收录", async () => {
    const row = await db
      .prepare("SELECT candidate_id FROM curation_candidates WHERE repo_slug = ?")
      .bind(DUP_SLUG)
      .first<{ candidate_id: string }>();
    await db
      .prepare("UPDATE curation_candidates SET status = 'promoted', total_score = 10, last_evaluated_at = NULL WHERE candidate_id = ?")
      .bind(row!.candidate_id)
      .run();

    await runCurationCycle(env, "test:cycle-3");

    const after = await db
      .prepare("SELECT status, total_score, last_evaluated_at FROM curation_candidates WHERE candidate_id = ?")
      .bind(row!.candidate_id)
      .first<{ status: string; total_score: number; last_evaluated_at: number | null }>();
    expect(after!.status).toBe("promoted"); // 状态未被评分覆盖
    expect(after!.total_score).toBe(10); // 未被重评
    expect(after!.last_evaluated_at).toBeNull(); // 根本没进入评估队列
  }, 300000);

  it("公开推荐 API：仅公开状态 + 白名单字段 + 评分降序（§15.1/§7.4，阶段二契约）", async () => {
    const payload = await getPublicRecommendations(env);

    expect(payload.success).toBe(true);
    expect(payload.algorithm_version).toMatch(/^curation-/);
    expect(payload.items.length).toBe(payload.stats.visible);

    const publicStates = ["recommended", "pending_review", "reviewing", "approved"];
    let prevScore = Number.MAX_SAFE_INTEGER;
    for (const item of payload.items) {
      expect(publicStates).toContain(item.status);
      // 白名单：绝不返回内部字段
      const keys = Object.keys(item);
      expect(keys).not.toContain("candidate_id");
      expect(keys).not.toContain("hard_check_detail");
      expect(keys).not.toContain("status_reason");
      expect(keys).not.toContain("catalog_row_key");
      // 评分降序
      if (item.total_score != null) {
        expect(item.total_score).toBeLessThanOrEqual(prevScore);
        prevScore = item.total_score;
      }
    }

    // promoted 不出现在公开列表（§7.4）
    expect(payload.items.some((i) => i.repo_slug === DUP_SLUG)).toBe(false);

    // 有评分的条目携带七维证据与理由
    const scored = payload.items.find((i) => i.total_score != null && (i.dimensions as unknown[]).length > 0);
    expect(scored).toBeDefined();
    expect((scored!.dimensions as Array<{ evidence: string[] }>).length).toBe(7);
    for (const d of scored!.dimensions as Array<{ evidence: string[] }>) {
      expect(d.evidence.length).toBeGreaterThan(0);
    }
    expect(scored!.reason).toContain("分");
  }, 60000);

  it("loadPoolData 直读校验：两池加载 + 精选库解析（§四 数据源）", async () => {
    const p = await loadPoolData(env);
    // stub 返回注入版池（真实池容量断言见 Cycle 1 的文件字节校验）
    expect(p.autoCount).toBe(autoRecords.length);
    expect(p.communityCount).toBe(communityRecords.length);
    expect(p.catalogSlugs.size).toBeGreaterThan(50);
  }, 60000);
});
