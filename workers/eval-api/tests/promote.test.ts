/**
 * 阶段四验收：正式收录（最终复核 + 写入精选库）集成测试（任务书 §十九 收录测试 1-10
 * + §十八 阶段四 + §十二 全流程）。
 *
 * 覆盖：
 *  1. 正常审核并收录：六阶段完成 + approved → 复核通过 → 触发写入 → 验证 → 状态同步 + 收录日志
 *  2. 重复收录同一仓库：已收录候选再次请求 → 幂等 already，不二次写入
 *  3. 连续点击收录：第二次请求幂等（不重复触发工作流）
 *  4. 并发提交同一工具：写入窗口内重复触发 → 409 IN_PROGRESS
 *  5. 精选库已存在同一工具：查重命中 → 跳过触发，直接补齐状态（§12.4 恢复）
 *  6. 收录前仓库被删除 → 422，停止收录
 *  7. 收录前许可证变化（不在认可名单）→ 422，停止收录
 *  8. 精选文件写入失败（工作流派发失败）→ 502 + 流程 failed + 失败日志；重试可恢复
 *  9. 写入成功但状态同步中断（state=written）→ 重试只补同步，不重复写入
 * 10. 请求超时后重试（state=writing 陈旧）→ 只核验不重复触发；写入到位后恢复同步
 *  + 权限/CSRF/状态门槛/评分门槛/分类校验回归
 *
 * 所有 GitHub 依赖（App token、owner 查询、Contents、工作流派发、匿名事实、raw 池）
 * 均在本文件 mock；D1 使用 miniflare 本地库并应用全部迁移（含 0004）。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { Miniflare } from "miniflare";
import worker from "../src/index";
import type { Env } from "../src/types";
import { sha256Hex } from "../src/security";
import { __resetOwnerCache } from "../src/curation/admin";

const SITE = "https://manningyangs.github.io";
const API = "https://api.test";
const OWNER = "manningyangs";
const REPO_PATH = "https://api.github.com/repos/manningyangs/AI-Shovel-Collection";
const CONTENTS_URL = `${REPO_PATH}/contents/catalog.csv?ref=main`;
const DISPATCH_URL = `${REPO_PATH}/actions/workflows/curation-promote.yml/dispatches`;
const RAW_BASE = "https://raw.githubusercontent.com/manningyangs/AI-Shovel-Collection/main";

const OWNER_TOKEN = "sess-promote-owner-0001";
const STRANGER_TOKEN = "sess-promote-stranger-0002";
const COOKIE = "shovel_curation_session";

const CID = "CUR-promote0000000000000000000001";
const CID_PROMOTED = "CUR-promote0000000000000000000002";
const SLUG = "fixture-owner/ai-tool";
const CATEGORY = "1. 目录、Skills 与通用 AI 工具适配";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PKCS1_PEM = privateKey.export({ type: "pkcs1", format: "pem" }) as string;

/* ----------------------------- mock 状态（每用例复位） ----------------------------- */

type FactsMode = "ok" | "not_found" | "bad_license" | "weak";

let catalogText = "";
let dispatchCount = 0;
let dispatchMode: "ok" | "fail" = "ok";
let autoWriteOnDispatch = true;
let factsMode: FactsMode = "ok";

const BASE_CATALOG = [
  "分类,铲子名称,GitHub仓库链接",
  `${CATEGORY},Existing Tool,https://github.com/example/existing`,
  "",
].join("\n");

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function strongFacts(licenseSpdx: string) {
  return {
    stargazers_count: 8000,
    forks_count: 420,
    description:
      "An AI agent toolkit that provides MCP server integrations, LLM workflow orchestration and a plugin system for automating developer tasks, with rich documentation and examples for real production usage.",
    topics: ["ai", "llm", "mcp", "agent", "developer-tools"],
    language: "TypeScript",
    license: { spdx_id: licenseSpdx },
    pushed_at: new Date(Date.now() - 86400_000).toISOString(),
    created_at: new Date(Date.now() - 3 * 365 * 86400_000).toISOString(),
    archived: false,
    fork: false,
    homepage: "https://example.com",
    size: 900,
  };
}

function weakFacts() {
  // 通过硬性检查（有描述→AI 信号/用途明确、非空仓库），但活跃/热度/生态全面偏低 → 评分 < 80
  return {
    stargazers_count: 5,
    forks_count: 1,
    description: "An AI utility script that does one small task with minimal documentation.",
    topics: [],
    language: null,
    license: null,
    pushed_at: "2023-01-01T00:00:00Z",
    created_at: "2023-01-01T00:00:00Z",
    archived: false,
    fork: false,
    homepage: null,
    size: 30,
  };
}

const AUTO_RECORD = {
  repo_slug: SLUG,
  repo_url: `https://github.com/${SLUG}`,
  title: "AI Test Tool",
  desc: "An AI agent tool for testing promotion flow",
  pushed_at: new Date(Date.now() - 86400_000).toISOString(),
  status: "active",
  extra: { confidence: 9, suggested_category: "开发者工具", endpoint_status: "ok" },
};

const COMMUNITY_RECORD = {
  submission_id: "SUB-test-0001",
  repo_slug: SLUG,
  repo_url: `https://github.com/${SLUG}`,
  title: "AI Test Tool",
  description: "Community submitted AI tool used by the promotion tests",
  review_status: "pending",
  stars: 8000,
  license_spdx: "MIT",
};

function mockGithub() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();

    // App 安装令牌
    if (method === "POST" && url.includes("/app/installations/") && url.endsWith("/access_tokens")) {
      return new Response(
        JSON.stringify({ token: "ghs_test_token", expires_at: new Date(Date.now() + 3600_000).toISOString() }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }
    // 仓库所有者查询（C5）
    if (url === REPO_PATH) {
      return new Response(JSON.stringify({ owner: { login: OWNER } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    // 精选库 Contents API（查重 / 分类 / 写入验证）
    if (url.startsWith(CONTENTS_URL)) {
      return new Response(
        JSON.stringify({ encoding: "base64", content: base64(catalogText) }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    // 独立收录写入工作流派发（§12.1.14）
    if (url === DISPATCH_URL && method === "POST") {
      dispatchCount += 1;
      if (dispatchMode === "fail") {
        return new Response("workflow error", { status: 500 });
      }
      if (autoWriteOnDispatch) {
        // 模拟工作流完成写入（下一次 Contents 查询即可核验到）
        const body = JSON.parse(String(init?.body || "{}")) as {
          inputs?: { repo_slug?: string; tool_name?: string; category?: string };
        };
        const s = body.inputs?.repo_slug || "";
        const t = (body.inputs?.tool_name || "Tool").replace(/,/g, "、");
        const cat = body.inputs?.category || CATEGORY;
        if (s) catalogText = catalogText.replace(/\n?$/, "\n") + `${cat},${t},https://github.com/${s}\n`;
      }
      return new Response(null, { status: 204 });
    }
    // raw 数据源（两池 + 精选库副本）
    if (url.startsWith(RAW_BASE + "/")) {
      const p = url.slice(RAW_BASE.length + 1);
      if (p === "live_multi.json") {
        return new Response(JSON.stringify({ candidates: [AUTO_RECORD] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (p === "astro/public/submissions/candidates.json") {
        return new Response(JSON.stringify({ candidates: [COMMUNITY_RECORD], total: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (p === "catalog.csv") {
        return new Response(catalogText, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }
    // 匿名第三方仓库事实核验（§12.1.8-11）
    if (url === `https://api.github.com/repos/${SLUG}`) {
      if (factsMode === "not_found") return new Response("Not Found", { status: 404 });
      if (factsMode === "weak") {
        return new Response(JSON.stringify(weakFacts()), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const spdx = factsMode === "bad_license" ? "SSPL-1.0" : "MIT";
      return new Response(JSON.stringify(strongFacts(spdx)), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  });
}

interface TestCtx {
  db: D1Database;
  env: Env;
}

type TypedResponse = Omit<Response, "json"> & { json(): Promise<any> };

describe("阶段四：正式收录（最终复核 + 写入精选库）", () => {
  let mf: Miniflare;
  let ctx: TestCtx;

  function fetchApi(pathname: string, init: RequestInit = {}, origin?: string): Promise<TypedResponse> {
    const headers = new Headers(init.headers);
    if (origin) headers.set("Origin", origin);
    return worker.fetch(new Request(`${API}${pathname}`, { ...init, headers }), ctx.env) as unknown as Promise<TypedResponse>;
  }

  function postPromote(cid: string, category?: string, token = OWNER_TOKEN, origin: string | undefined = SITE) {
    const headers = new Headers({ "Content-Type": "application/json", Cookie: `${COOKIE}=${token}` });
    return fetchApi(
      `/api/curation/admin/candidates/${cid}/promote`,
      { method: "POST", headers, body: JSON.stringify(category === undefined ? {} : { category }) },
      origin,
    );
  }

  async function insertSession(token: string, login: string, expiresAt: number) {
    await ctx.db
      .prepare(
        `INSERT INTO sessions (token_hash, github_user_id, github_login, created_at, expires_at, revoked)
         VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .bind(await sha256Hex(token), 2002, login, Math.floor(Date.now() / 1000), expiresAt)
      .run();
  }

  /** 置为 approved 并补齐六阶段人工结论（1-5 pass/warn，6 pass） */
  async function approveCandidate(cid = CID) {
    const now = Math.floor(Date.now() / 1000);
    await ctx.db
      .prepare(`UPDATE curation_candidates SET status = 'approved', status_reason = '所有者确认收录' WHERE candidate_id = ?`)
      .bind(cid)
      .run();
    for (let i = 1; i <= 6; i++) {
      await ctx.db
        .prepare(
          `INSERT INTO curation_reviews (candidate_id, stage_index, result, evidence, checked_at, reviewer_note, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(candidate_id, stage_index) DO UPDATE SET result = excluded.result, checked_at = excluded.checked_at, updated_at = excluded.updated_at`,
        )
        .bind(cid, i, "pass", JSON.stringify({ note: "阶段四测试夹具" }), now, "test", now)
        .run();
    }
  }

  async function insertPromotion(row: {
    cid?: string;
    slug?: string;
    state: string;
    ageSeconds?: number;
    category?: string | null;
    error?: string | null;
  }) {
    const now = Math.floor(Date.now() / 1000);
    await ctx.db
      .prepare(
        `INSERT INTO curation_promotions (candidate_id, repo_slug, state, category, attempts, error, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(candidate_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at, error = excluded.error`,
      )
      .bind(
        row.cid ?? CID,
        row.slug ?? SLUG,
        row.state,
        row.category ?? CATEGORY,
        row.error ?? null,
        now - (row.ageSeconds ?? 0),
        now - (row.ageSeconds ?? 0),
      )
      .run();
  }

  beforeAll(async () => {
    mockGithub();

    mf = new Miniflare({
      modules: true,
      script: "export default { async fetch() { return new Response('ok'); } }",
      d1Databases: { DB: "promote-test" },
    });
    const db = await mf.getD1Database("DB");
    for (const f of ["0001_initial_schema.sql", "0002_collection_submissions.sql", "0003_curation.sql", "0004_curation_promotions.sql"]) {
      const sql = readFileSync(path.join(process.cwd(), "migrations", f), "utf8").replace(/--[^\n]*/g, "");
      for (const st of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
        await db.prepare(st).run();
      }
    }

    const env: Env = {
      DB: db,
      GITHUB_APP_CLIENT_ID: "test-client-id",
      GITHUB_APP_CLIENT_SECRET: "test-client-secret",
      GITHUB_APP_PRIVATE_KEY: PKCS1_PEM,
      GITHUB_APP_INSTALLATION_ID: "TEST-INSTALLATION",
      EVAL_PROGRESS_SECRET: "test-progress-secret",
      COLLECTION_CALLBACK_SECRET: "test-collection-secret",
      COLLECTION_IP_SALT: "test-ip-salt",
      GITHUB_APP_ID: "123456",
      GITHUB_API_REPOSITORY: "manningyangs/AI-Shovel-Collection",
      GITHUB_WORKFLOW_FILE: "evaluate-shovel.yml",
      PUBLIC_SITE_BASE_URL: "https://manningyangs.github.io/AI-Shovel-Collection",
      ALLOWED_SITE_ORIGINS: `${SITE},http://localhost:4321`,
      RATE_DAILY_PER_USER: "5",
      RATE_MAX_ACTIVE_PER_REPO: "1",
      RATE_MAX_QUEUED_PER_USER: "2",
      SESSION_TTL_SECONDS: "28800",
      COLLECTION_WORKFLOW_FILE: "collection-submission.yml",
      COLLECTION_RATE_DAILY_PER_IP: "5",
      CURATION_WORKFLOW_FILE: "curation-promote.yml",
      // 测试提速：核验等待 2 次 × 5ms
      PROMOTE_VERIFY_ATTEMPTS: "2",
      PROMOTE_VERIFY_INTERVAL_MS: "5",
    };
    ctx = { db, env };
    __resetOwnerCache();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await mf.dispose();
  });

  beforeEach(async () => {
    for (const t of [
      "curation_promotions",
      "curation_reviews",
      "curation_audit_logs",
      "curation_scores",
      "curation_sources",
      "curation_candidates",
      "sessions",
    ]) {
      await ctx.db.prepare(`DELETE FROM ${t}`).run();
    }
    __resetOwnerCache();

    catalogText = BASE_CATALOG;
    dispatchCount = 0;
    dispatchMode = "ok";
    autoWriteOnDispatch = true;
    factsMode = "ok";

    const now = Math.floor(Date.now() / 1000);
    await ctx.db
      .prepare(
        `INSERT INTO curation_candidates
           (candidate_id, repo_slug, repo_url, tool_name, description, status, status_reason,
            total_score, hard_check_status, algorithm_version, data_confidence,
            first_recommended_at, last_evaluated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'recommended', '综合 88 分达到公开推荐门槛且硬性检查通过',
                 88, 'pass', 'curation-1.0.0', 'ok', ?, ?, ?, ?)`,
      )
      .bind(
        CID,
        SLUG,
        `https://github.com/${SLUG}`,
        "AI Test Tool",
        "An AI agent tool for testing",
        now - 86400,
        now - 3600,
        now - 86400,
        now - 3600,
      )
      .run();
    await ctx.db
      .prepare(
        `INSERT INTO curation_candidates
           (candidate_id, repo_slug, repo_url, tool_name, status, algorithm_version, created_at, updated_at)
         VALUES (?, 'fixture-owner/promoted-tool', 'https://github.com/fixture-owner/promoted-tool',
                 'Promoted Tool', 'promoted', 'curation-1.0.0', ?, ?)`,
      )
      .bind(CID_PROMOTED, now, now)
      .run();
    // 已收录夹具的流程状态（幂等基线）
    await ctx.db
      .prepare(
        `INSERT INTO curation_promotions (candidate_id, repo_slug, state, category, catalog_row_key, attempts, created_at, updated_at)
         VALUES (?, 'fixture-owner/promoted-tool', 'synced', ?, ?, 1, ?, ?)`,
      )
      .bind(CID_PROMOTED, CATEGORY, `${CATEGORY}::fixture-owner/promoted-tool`, now, now)
      .run();
    await ctx.db
      .prepare(
        `INSERT INTO curation_sources (candidate_id, source_type, source_ref, source_status, linked_at)
         VALUES (?, 'auto_discovery', ?, 'active', ?)`,
      )
      .bind(CID, SLUG, now)
      .run();

    const inOneHour = now + 3600;
    await insertSession(OWNER_TOKEN, OWNER, inOneHour);
    await insertSession(STRANGER_TOKEN, "random-developer", inOneHour);
  });

  /* ------------------------------ §19 收录测试 1-10 ------------------------------ */

  it("1. 正常审核并收录：复核通过 → 触发写入 → 验证 → 状态同步 + 收录日志", async () => {
    await approveCandidate();

    const res = await postPromote(CID, CATEGORY);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.status).toBe("promoted");
    expect(body.already).toBeFalsy();
    expect(body.catalog_row_key).toBe(`${CATEGORY}::${SLUG}`);
    expect(dispatchCount).toBe(1);
    expect(catalogText).toContain(`https://github.com/${SLUG}`);

    const cand = await ctx.db
      .prepare(`SELECT status, promoted_at, catalog_row_key FROM curation_candidates WHERE candidate_id = ?`)
      .bind(CID)
      .first<{ status: string; promoted_at: number | null; catalog_row_key: string | null }>();
    expect(cand?.status).toBe("promoted");
    expect(cand?.promoted_at).toBeGreaterThan(0);
    expect(cand?.catalog_row_key).toBe(`${CATEGORY}::${SLUG}`);

    const promo = await ctx.db
      .prepare(`SELECT state, category, error FROM curation_promotions WHERE candidate_id = ?`)
      .bind(CID)
      .first<{ state: string; category: string; error: string | null }>();
    expect(promo?.state).toBe("synced");
    expect(promo?.category).toBe(CATEGORY);
    expect(promo?.error).toBeNull();

    const src = await ctx.db
      .prepare(`SELECT source_status FROM curation_sources WHERE candidate_id = ?`)
      .bind(CID)
      .first<{ source_status: string }>();
    expect(src?.source_status).toBe("promoted");

    const log = await ctx.db
      .prepare(`SELECT result, failure_reason, request_id FROM curation_audit_logs WHERE action = 'promote' AND target = ?`)
      .bind(CID)
      .first<{ result: string; failure_reason: string; request_id: string | null }>();
    expect(log?.result).toBe("ok");
    expect(log?.failure_reason).toContain(CATEGORY);
    expect(log?.request_id).toBeTruthy();
  });

  it("2. 重复收录同一仓库：已收录候选再次请求 → 幂等 already，不二次写入", async () => {
    const res = await postPromote(CID_PROMOTED, CATEGORY);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.already).toBe(true);
    expect(body.status).toBe("promoted");
    expect(dispatchCount).toBe(0);
  });

  it("3. 连续点击收录：第二次请求幂等（不重复触发工作流）", async () => {
    await approveCandidate();

    const first = await postPromote(CID, CATEGORY);
    expect(first.status).toBe(200);
    expect(dispatchCount).toBe(1);

    const second = await postPromote(CID, CATEGORY);
    const body = await second.json();
    expect(second.status).toBe(200);
    expect(body.already).toBe(true);
    expect(dispatchCount).toBe(1); // 未重复触发
  });

  it("4. 并发提交同一工具：写入窗口内重复触发 → 409 IN_PROGRESS", async () => {
    await approveCandidate();
    await insertPromotion({ state: "writing", ageSeconds: 0 }); // 刚触发，仍在窗口内

    const res = await postPromote(CID, CATEGORY);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe("PROMOTION_IN_PROGRESS");
    expect(dispatchCount).toBe(0);
  });

  it("5. 精选库已存在同一工具：查重命中 → 跳过触发直接补齐状态（§12.4）", async () => {
    await approveCandidate();
    catalogText = BASE_CATALOG + `${CATEGORY},AI Test Tool,https://github.com/${SLUG}\n`;

    const res = await postPromote(CID, CATEGORY);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("promoted");
    expect(dispatchCount).toBe(0); // 未触发工作流（不重复写入）

    const cand = await ctx.db
      .prepare(`SELECT status FROM curation_candidates WHERE candidate_id = ?`)
      .bind(CID)
      .first<{ status: string }>();
    expect(cand?.status).toBe("promoted");
  });

  it("6. 收录前仓库被删除 → 422 REPO_UNAVAILABLE，停止收录", async () => {
    await approveCandidate();
    factsMode = "not_found";

    const res = await postPromote(CID, CATEGORY);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("REPO_UNAVAILABLE");
    expect(dispatchCount).toBe(0);

    const cand = await ctx.db
      .prepare(`SELECT status FROM curation_candidates WHERE candidate_id = ?`)
      .bind(CID)
      .first<{ status: string }>();
    expect(cand?.status).toBe("approved"); // 状态未被推进

    const log = await ctx.db
      .prepare(`SELECT result FROM curation_audit_logs WHERE action = 'promote' AND target = ?`)
      .bind(CID)
      .first<{ result: string }>();
    expect(log?.result).toBe("fail"); // 失败已记入收录日志

    const promo = await ctx.db
      .prepare(`SELECT candidate_id FROM curation_promotions WHERE candidate_id = ?`)
      .bind(CID)
      .first();
    expect(promo).toBeNull(); // 关键检查失败在抢占之前 → 无流程残留
  });

  it("7. 收录前许可证变化（SSPL-1.0 不在认可名单）→ 422，停止收录", async () => {
    await approveCandidate();
    factsMode = "bad_license";

    const res = await postPromote(CID, CATEGORY);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("LICENSE_NOT_ALLOWED");
    expect(dispatchCount).toBe(0);

    const cand = await ctx.db
      .prepare(`SELECT status FROM curation_candidates WHERE candidate_id = ?`)
      .bind(CID)
      .first<{ status: string }>();
    expect(cand?.status).toBe("approved");
  });

  it("8. 精选文件写入失败（工作流派发失败）→ 502 + 流程 failed + 失败日志；重试可恢复", async () => {
    await approveCandidate();
    dispatchMode = "fail";

    const res = await postPromote(CID, CATEGORY);
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.error.code).toBe("PROMOTE_DISPATCH_FAILED");

    const promo = await ctx.db
      .prepare(`SELECT state, error FROM curation_promotions WHERE candidate_id = ?`)
      .bind(CID)
      .first<{ state: string; error: string | null }>();
    expect(promo?.state).toBe("failed");
    expect(promo?.error).toBeTruthy();

    const log = await ctx.db
      .prepare(`SELECT result FROM curation_audit_logs WHERE action = 'promote' AND target = ? AND result = 'fail'`)
      .bind(CID)
      .first<{ result: string }>();
    expect(log?.result).toBe("fail");

    // 修复后重试 → 失败态可恢复为完整收录
    dispatchMode = "ok";
    const retry = await postPromote(CID, CATEGORY);
    expect(retry.status).toBe(200);
    const after = await ctx.db
      .prepare(`SELECT status FROM curation_candidates WHERE candidate_id = ?`)
      .bind(CID)
      .first<{ status: string }>();
    expect(after?.status).toBe("promoted");
    expect(dispatchCount).toBe(2); // 失败 + 重试各一次
  });

  it("9. 写入成功但状态同步中断（state=written）→ 重试只补同步，不重复写入", async () => {
    await approveCandidate();
    // 模拟：工作流已把仓库写进精选库，但 Worker 在状态同步前失败
    catalogText = BASE_CATALOG + `${CATEGORY},AI Test Tool,https://github.com/${SLUG}\n`;
    await insertPromotion({ state: "written", ageSeconds: 60 });

    const res = await postPromote(CID, CATEGORY);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe("promoted");
    expect(dispatchCount).toBe(0); // 只补同步，未再次触发写入

    const promo = await ctx.db
      .prepare(`SELECT state FROM curation_promotions WHERE candidate_id = ?`)
      .bind(CID)
      .first<{ state: string }>();
    expect(promo?.state).toBe("synced");
  });

  it("10. 请求超时后重试：writing 陈旧 → 只核验不重复触发；写入到位后恢复同步", async () => {
    await approveCandidate();
    await insertPromotion({ state: "writing", ageSeconds: 100 }); // 陈旧但未超 5 分钟

    // 工作流尚未完成 → 202，且不重复触发
    const first = await postPromote(CID, CATEGORY);
    expect(first.status).toBe(202);
    const firstBody = await first.json();
    expect(firstBody.state).toBe("writing");
    expect(dispatchCount).toBe(0);

    // 模拟工作流稍后完成写入 → 再次请求恢复为完整收录
    catalogText = BASE_CATALOG + `${CATEGORY},AI Test Tool,https://github.com/${SLUG}\n`;
    const second = await postPromote(CID, CATEGORY);
    const body = await second.json();
    expect(second.status).toBe(200);
    expect(body.status).toBe("promoted");

    const cand = await ctx.db
      .prepare(`SELECT status FROM curation_candidates WHERE candidate_id = ?`)
      .bind(CID)
      .first<{ status: string }>();
    expect(cand?.status).toBe("promoted");
  });

  /* ------------------------------ 门槛与权限回归 ------------------------------ */

  it("状态未到 approved（recommended）→ 409 APPROVAL_REQUIRED", async () => {
    const res = await postPromote(CID, CATEGORY);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("APPROVAL_REQUIRED");
    expect(dispatchCount).toBe(0);
  });

  it("六阶段未完成（缺 1-5 结论）→ 409 REVIEW_INCOMPLETE", async () => {
    const now = Math.floor(Date.now() / 1000);
    await ctx.db
      .prepare(`UPDATE curation_candidates SET status = 'approved' WHERE candidate_id = ?`)
      .bind(CID)
      .run();
    await ctx.db
      .prepare(
        `INSERT INTO curation_reviews (candidate_id, stage_index, result, checked_at, updated_at)
         VALUES (?, 6, 'pass', ?, ?)`,
      )
      .bind(CID, now, now)
      .run();

    const res = await postPromote(CID, CATEGORY);
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe("REVIEW_INCOMPLETE");
    expect(body.error.missing_stages).toEqual([1, 2, 3, 4, 5]);
  });

  it("评分低于收录门槛（80）→ 422 BELOW_THRESHOLD", async () => {
    await approveCandidate();
    factsMode = "weak";

    const res = await postPromote(CID, CATEGORY);
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.error.code).toBe("BELOW_THRESHOLD");
    expect(dispatchCount).toBe(0);
  });

  it("分类缺失 / 不属于精选库现有分类 → 400", async () => {
    await approveCandidate();
    const noCat = await postPromote(CID, undefined);
    expect(noCat.status).toBe(400);
    expect((await noCat.json()).error.code).toBe("CATEGORY_REQUIRED");

    const badCat = await postPromote(CID, "不存在的分类");
    expect(badCat.status).toBe(400);
    expect((await badCat.json()).error.code).toBe("CATEGORY_INVALID");
    expect(dispatchCount).toBe(0);
  });

  it("GET promote：返回精选库分类与可收录状态", async () => {
    await approveCandidate();
    const res = await fetchApi(`/api/curation/admin/candidates/${CID}/promote`, {
      headers: { Cookie: `${COOKIE}=${OWNER_TOKEN}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.can_promote).toBe(true);
    expect(body.categories).toContain(CATEGORY);
    expect(body.in_catalog).toBe(false);
    expect(body.status).toBe("approved");
  });

  it("权限：非所有者 403 / 未登录 401 / 缺失跨站 Origin 403（CSRF）", async () => {
    await approveCandidate();

    const stranger = await postPromote(CID, CATEGORY, STRANGER_TOKEN);
    expect(stranger.status).toBe(403);
    expect((await stranger.json()).error.code).toBe("NOT_OWNER");

    const anonymous = await postPromote(CID, CATEGORY, "");
    expect(anonymous.status).toBe(401);

    // 空字符串 → 不设置 Origin（显式传 undefined 会命中默认参数 SITE）
    const noOrigin = await postPromote(CID, CATEGORY, OWNER_TOKEN, "");
    expect(noOrigin.status).toBe(403);
    expect((await noOrigin.json()).error.code).toBe("CSRF_ORIGIN_REQUIRED");

    expect(dispatchCount).toBe(0);
  });
});
