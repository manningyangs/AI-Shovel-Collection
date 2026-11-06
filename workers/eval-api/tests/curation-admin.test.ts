/**
 * 阶段三验收：审核工作台权限与六阶段审核集成测试（任务书 §十九 权限测试 + §十八 阶段三）。
 *
 * 覆盖：
 *  - 未登录 / 过期会话 / 无效 Cookie 访问管理员 API → 401
 *  - 普通用户 / 协作者 / Admin / Maintain 账号（凡非仓库所有者）→ 403（§9.2）
 *  - 仓库所有者（session.login == GitHub API 仓库 owner）→ 放行（C5）
 *  - 伪造前端用户名 / 伪造参数 / 直接调用管理员 API / 缺失或跨站 Origin → 拒绝
 *  - HttpOnly Cookie 升级签发与登出（C1）
 *  - 六阶段审核进度持久化、状态机推进、决策流转与审计日志（§十/§十一）
 *
 * 所有 GitHub 依赖（App token、仓库 owner 查询）均在本文件 mock；
 * D1 使用 miniflare 本地库并应用全部迁移（含 0003）。
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
const OWNER = "manningyangs"; // 与 mock 的 GitHub 仓库 owner 一致
const REPO_PATH = "https://api.github.com/repos/manningyangs/AI-Shovel-Collection";

const OWNER_TOKEN = "sess-owner-token-abc123";
const STRANGER_TOKEN = "sess-stranger-token-xyz789";
const COLLAB_TOKEN = "sess-collab-token-aaa111";
const ADMIN_TOKEN = "sess-admin-token-bbb222";
const MAINTAIN_TOKEN = "sess-maintain-token-ccc333";
const EXPIRED_TOKEN = "sess-expired-token-ddd444";

const COOKIE = "shovel_curation_session";
const CID = "CUR-test0000000000000000000000001";
const CID_PROMOTED = "CUR-test0000000000000000000000002";
const SLUG = "fixture-owner/ai-tool";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PKCS1_PEM = privateKey.export({ type: "pkcs1", format: "pem" }) as string;

function mockGithub() {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    if (method === "POST" && url.includes("/app/installations/") && url.endsWith("/access_tokens")) {
      return new Response(
        JSON.stringify({ token: "ghs_test_token", expires_at: new Date(Date.now() + 3600_000).toISOString() }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.startsWith(REPO_PATH)) {
      return new Response(JSON.stringify({ owner: { login: OWNER } }), {
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

/** 测试用：json() 直接回 any，省去逐处断言类型标注 */
type TypedResponse = Omit<Response, "json"> & { json(): Promise<any> };

describe("阶段三：审核工作台权限与六阶段审核", () => {
  let mf: Miniflare;
  let ctx: TestCtx;

  function fetchApi(pathname: string, init: RequestInit = {}, origin?: string): Promise<TypedResponse> {
    const headers = new Headers(init.headers);
    if (origin) headers.set("Origin", origin);
    return worker.fetch(
      new Request(`${API}${pathname}`, { ...init, headers }),
      ctx.env,
    ) as unknown as Promise<TypedResponse>;
  }

  function withOwnerCookie(init: RequestInit = {}): RequestInit {
    const headers = new Headers(init.headers);
    headers.set("Cookie", `${COOKIE}=${OWNER_TOKEN}`);
    return { ...init, headers };
  }

  function withCookie(token: string, init: RequestInit = {}): RequestInit {
    const headers = new Headers(init.headers);
    headers.set("Cookie", `${COOKIE}=${token}`);
    return { ...init, headers };
  }

  async function insertSession(token: string, login: string, expiresAt: number) {
    await ctx.db
      .prepare(
        `INSERT INTO sessions (token_hash, github_user_id, github_login, created_at, expires_at, revoked)
         VALUES (?, ?, ?, ?, ?, 0)`,
      )
      .bind(await sha256Hex(token), 1001, login, Math.floor(Date.now() / 1000), expiresAt)
      .run();
  }

  beforeAll(async () => {
    mockGithub();

    mf = new Miniflare({
      modules: true,
      script: "export default { async fetch() { return new Response('ok'); } }",
      d1Databases: { DB: "curation-admin-test" },
    });
    const db = await mf.getD1Database("DB");
    for (const f of ["0001_initial_schema.sql", "0002_collection_submissions.sql", "0003_curation.sql"]) {
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

    const now = Math.floor(Date.now() / 1000);
    // 候选夹具：待审核推荐 / 已收录 / 待人工评估
    await ctx.db
      .prepare(
        `INSERT INTO curation_candidates
           (candidate_id, repo_slug, repo_url, tool_name, description, status, status_reason,
            total_score, hard_check_status, hard_check_detail, algorithm_version, data_confidence,
            first_recommended_at, last_evaluated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        CID,
        SLUG,
        `https://github.com/${SLUG}`,
        "AI Test Tool",
        "An AI agent tool for testing",
        "recommended",
        "综合 88 分达到公开推荐门槛且硬性检查通过",
        88,
        "pass",
        JSON.stringify([{ key: "exists", label: "仓库存在", result: "pass", detail: "GitHub API 确认可访问" }]),
        "curation-1.0.0",
        "ok",
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
         VALUES (?, ?, ?, ?, 'promoted', 'curation-1.0.0', ?, ?)`,
      )
      .bind(CID_PROMOTED, "fixture-owner/promoted-tool", "https://github.com/fixture-owner/promoted-tool", "Promoted Tool", now, now)
      .run();
    await ctx.db
      .prepare(
        `INSERT INTO curation_scores (candidate_id, total_score, dimensions, reason, data_confidence, scored_at, algorithm_version)
         VALUES (?, ?, ?, ?, 'ok', ?, 'curation-1.0.0')`,
      )
      .bind(
        CID,
        88,
        JSON.stringify([{ key: "ai_value", label: "AI 工具价值与相关性", weight: 20, score: 18, evidence: ["README 明确 AI 用途"], confidence: "ok" }]),
        "AI 场景明确、证据充分。",
        now - 3600,
      )
      .run();
    await ctx.db
      .prepare(
        `INSERT INTO curation_sources (candidate_id, source_type, source_ref, source_status, linked_at)
         VALUES (?, 'auto_discovery', 'fixture-owner/ai-tool', 'active', ?)`,
      )
      .bind(CID, now)
      .run();

    // 会话夹具：所有者 / 各类非所有者 / 过期
    const inOneHour = now + 3600;
    await insertSession(OWNER_TOKEN, OWNER, inOneHour);
    await insertSession(STRANGER_TOKEN, "random-developer", inOneHour);
    await insertSession(COLLAB_TOKEN, "collab-user", inOneHour);
    await insertSession(ADMIN_TOKEN, "another-admin", inOneHour);
    await insertSession(MAINTAIN_TOKEN, "maintain-user", inOneHour);
    await insertSession(EXPIRED_TOKEN, OWNER, now - 10);
  });

  /* ------------------------------ §19 权限测试 ------------------------------ */

  describe("§19 权限矩阵：只有仓库所有者本人可进入审核", () => {
    it("1. 未登录访问审核后台 → 401", async () => {
      const res = await fetchApi("/api/curation/admin/me");
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");

      const list = await fetchApi("/api/curation/admin/candidates");
      expect(list.status).toBe(401);
    });

    it("10. 过期会话调用审核接口 → 401", async () => {
      const res = await fetchApi("/api/curation/admin/me", withCookie(EXPIRED_TOKEN));
      expect(res.status).toBe(401);
      expect((await res.json()).error.code).toBe("INVALID_SESSION");
    });

    it("无效 Cookie → 401", async () => {
      const res = await fetchApi("/api/curation/admin/me", withCookie("not-a-real-token"));
      expect(res.status).toBe(401);
    });

    it("2-5. 普通用户 / 协作者 / Admin / Maintain 登录一律 403（非所有者即拒绝）", async () => {
      for (const token of [STRANGER_TOKEN, COLLAB_TOKEN, ADMIN_TOKEN, MAINTAIN_TOKEN]) {
        const me = await fetchApi("/api/curation/admin/me", withCookie(token));
        expect(me.status).toBe(403);
        expect((await me.json()).error.code).toBe("NOT_OWNER");

        const list = await fetchApi("/api/curation/admin/candidates", withCookie(token));
        expect(list.status).toBe(403);
      }
    });

    it("6. 仓库所有者登录 → 放行", async () => {
      const res = await fetchApi("/api/curation/admin/me", withCookie(OWNER_TOKEN));
      expect(res.status).toBe(200);
      expect((await res.json()).user.login).toBe(OWNER);
    });

    it("7. 伪造前端用户名（请求体指定 owner/login）不产生任何权限", async () => {
      const res = await fetchApi(
        "/api/curation/admin/candidates/" + CID + "/decision",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${STRANGER_TOKEN}` },
          body: JSON.stringify({ action: "approve", github_login: OWNER, owner: OWNER, is_admin: true }),
        },
        SITE,
      );
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("NOT_OWNER");
    });

    it("8. 伪造请求参数（非法阶段 / 非法结果）→ 400", async () => {
      const badStage = await fetchApi(
        `/api/curation/admin/candidates/${CID}/reviews/9`,
        { method: "PUT", headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${OWNER_TOKEN}` }, body: JSON.stringify({ result: "pass" }) },
        SITE,
      );
      expect(badStage.status).toBe(400);

      const badResult = await fetchApi(
        `/api/curation/admin/candidates/${CID}/reviews/2`,
        { method: "PUT", headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${OWNER_TOKEN}` }, body: JSON.stringify({ result: "yolo" }) },
        SITE,
      );
      expect(badResult.status).toBe(400);

      const badStatus = await fetchApi(`/api/curation/admin/candidates?status=__drop__`, withOwnerCookie());
      expect(badStatus.status).toBe(400);
    });

    it("9. 直接调用管理员 API：无 Origin 的写操作 → 403（CSRF）；跨站 Origin → 403", async () => {
      const noOrigin = await fetchApi(
        `/api/curation/admin/candidates/${CID}/decision`,
        { method: "POST", headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${OWNER_TOKEN}` }, body: JSON.stringify({ action: "approve" }) },
      );
      expect(noOrigin.status).toBe(403);
      expect((await noOrigin.json()).error.code).toBe("CSRF_ORIGIN_REQUIRED");

      const evil = await fetchApi(
        `/api/curation/admin/candidates/${CID}/decision`,
        { method: "POST", headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${OWNER_TOKEN}` }, body: JSON.stringify({ action: "approve" }) },
        "https://evil.example.com",
      );
      expect(evil.status).toBe(403);
      expect((await evil.json()).error.code).toBe("ORIGIN_NOT_ALLOWED");
    });
  });

  /* ------------------------------ Cookie 会话（C1） ------------------------------ */

  describe("HttpOnly Cookie 会话签发与登出（C1）", () => {
    it("以现有 Bearer 会话升级签发 HttpOnly Cookie（Secure; SameSite=None）", async () => {
      const res = await fetchApi(
        "/api/curation/session",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_token: OWNER_TOKEN }),
        },
        SITE,
      );
      expect(res.status).toBe(200);
      const setCookie = res.headers.get("Set-Cookie") || "";
      expect(setCookie).toContain(`${COOKIE}=${OWNER_TOKEN}`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("Secure");
      expect(setCookie).toContain("SameSite=None");
      expect((await res.json()).user.login).toBe(OWNER);

      // 签发的 Cookie 可直接访问管理员接口
      const me = await fetchApi("/api/curation/admin/me", withOwnerCookie());
      expect(me.status).toBe(200);
    });

    it("缺失 / 无效会话凭证 → 400 / 401；缺失 Origin → 403", async () => {
      const missing = await fetchApi(
        "/api/curation/session",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
        SITE,
      );
      expect(missing.status).toBe(400);

      const invalid = await fetchApi(
        "/api/curation/session",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_token: "bogus" }) },
        SITE,
      );
      expect(invalid.status).toBe(401);

      const noOrigin = await fetchApi(
        "/api/curation/session",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_token: OWNER_TOKEN }) },
      );
      expect(noOrigin.status).toBe(403);
    });

    it("登出：清 Cookie + 撤销会话（幂等）", async () => {
      const out = await fetchApi(
        "/api/curation/admin/logout",
        { method: "POST", headers: { Cookie: `${COOKIE}=${OWNER_TOKEN}` } },
        SITE,
      );
      expect(out.status).toBe(200);
      const setCookie = out.headers.get("Set-Cookie") || "";
      expect(setCookie).toContain(`${COOKIE}=`);
      expect(setCookie).toMatch(/Max-Age=0/i);

      // 会话已撤销 → 即使浏览器仍带旧 Cookie 也 401
      const me = await fetchApi("/api/curation/admin/me", withOwnerCookie());
      expect(me.status).toBe(401);
    });
  });

  /* ------------------------------ 列表与详情 ------------------------------ */

  describe("审核任务列表与完整证据详情", () => {
    it("所有者可见列表；默认排除已收录，可按 status 指定", async () => {
      const def = await fetchApi("/api/curation/admin/candidates", withOwnerCookie());
      expect(def.status).toBe(200);
      const defBody = await def.json();
      const ids = defBody.items.map((i: { candidate_id: string }) => i.candidate_id);
      expect(ids).toContain(CID);
      expect(ids).not.toContain(CID_PROMOTED);
      expect(defBody.counts.promoted).toBe(1);

      const promoted = await fetchApi("/api/curation/admin/candidates?status=promoted", withOwnerCookie());
      const pBody = await promoted.json();
      expect(pBody.items.map((i: { candidate_id: string }) => i.candidate_id)).toEqual([CID_PROMOTED]);

      const search = await fetchApi("/api/curation/admin/candidates?q=ai-tool", withOwnerCookie());
      expect((await search.json()).items.length).toBe(1);
    });

    it("详情返回评分依据、硬检证据、来源与审核日志（仅所有者）", async () => {
      const ownerRes = await fetchApi(`/api/curation/admin/candidates/${CID}`, withOwnerCookie());
      expect(ownerRes.status).toBe(200);
      const detail = await ownerRes.json();
      expect(detail.candidate.repo_slug).toBe(SLUG);
      expect(detail.candidate.hard_check[0].key).toBe("exists");
      expect(detail.latest_score.total_score).toBe(88);
      expect(detail.latest_score.dimensions[0].evidence.length).toBeGreaterThan(0);
      expect(detail.sources[0].source_type).toBe("auto_discovery");
      expect(detail.reviews).toEqual([]);
      expect(detail.can_decide).toBe(false);

      // 非所有者拿不到任何证据
      const denied = await fetchApi(`/api/curation/admin/candidates/${CID}`, withCookie(STRANGER_TOKEN));
      expect(denied.status).toBe(403);

      // 未知 ID → 404
      const missing = await fetchApi(`/api/curation/admin/candidates/CUR-nope`, withOwnerCookie());
      expect(missing.status).toBe(404);
    });
  });

  /* ------------------------ 六阶段审核与决策（§十/§十一） ------------------------ */

  describe("六阶段审核进度持久化与最终决策", () => {
    async function saveStage(stage: number, body: Record<string, unknown>): Promise<TypedResponse> {
      return fetchApi(
        `/api/curation/admin/candidates/${CID}/reviews/${stage}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${OWNER_TOKEN}` },
          body: JSON.stringify(body),
        },
        SITE,
      );
    }

    it("保存阶段结果：落库 + 首次检查推进 recommended→reviewing + 审计日志", async () => {
      const res = await saveStage(1, {
        result: "pass",
        evidence: { repo_exists: true, checked_via: "GitHub API" },
        reviewer_note: "仓库真实可访问",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("reviewing");

      // 持久化（刷新可恢复 §11）
      const row = await ctx.db
        .prepare(`SELECT result, reviewer_note FROM curation_reviews WHERE candidate_id = ? AND stage_index = 1`)
        .bind(CID)
        .first<{ result: string; reviewer_note: string }>();
      expect(row?.result).toBe("pass");
      expect(row?.reviewer_note).toBe("仓库真实可访问");

      const cand = await ctx.db
        .prepare(`SELECT status FROM curation_candidates WHERE candidate_id = ?`)
        .bind(CID)
        .first<{ status: string }>();
      expect(cand?.status).toBe("reviewing");

      const log = await ctx.db
        .prepare(`SELECT actor_login, action FROM curation_audit_logs WHERE target = ? ORDER BY id DESC`)
        .bind(CID)
        .first<{ actor_login: string; action: string }>();
      expect(log?.actor_login).toBe(OWNER);
      expect(log?.action).toBe("review");

      // 详情回读：阶段结果 + 标记 stale（last_evaluated_at 更新于 checked_at 时）
      const detail = await (await fetchApi(`/api/curation/admin/candidates/${CID}`, withOwnerCookie())).json();
      expect(detail.reviews.length).toBe(1);
      expect(detail.reviews[0].stage_index).toBe(1);
      expect(detail.can_decide).toBe(false);

      await ctx.db
        .prepare(`UPDATE curation_candidates SET last_evaluated_at = ? WHERE candidate_id = ?`)
        .bind(Math.floor(Date.now() / 1000) + 120, CID)
        .run();
      const detail2 = await (await fetchApi(`/api/curation/admin/candidates/${CID}`, withOwnerCookie())).json();
      expect(detail2.reviews[0].stale).toBe(true);
    });

    it("非所有者保存审核结果 → 403；已收录候选不可修改 → 409", async () => {
      const stranger = await fetchApi(
        `/api/curation/admin/candidates/${CID}/reviews/1`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${STRANGER_TOKEN}` },
          body: JSON.stringify({ result: "pass" }),
        },
        SITE,
      );
      expect(stranger.status).toBe(403);

      const promoted = await fetchApi(
        `/api/curation/admin/candidates/${CID_PROMOTED}/reviews/1`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${OWNER_TOKEN}` },
          body: JSON.stringify({ result: "pass" }),
        },
        SITE,
      );
      expect(promoted.status).toBe(409);
    });

    it("前五阶段未完成时不能确认收录（409 REVIEW_INCOMPLETE）", async () => {
      await saveStage(1, { result: "pass" });
      const res = await fetchApi(
        `/api/curation/admin/candidates/${CID}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${OWNER_TOKEN}` },
          body: JSON.stringify({ action: "approve" }),
        },
        SITE,
      );
      expect(res.status).toBe(409);
      const err = await res.json();
      expect(err.error.code).toBe("REVIEW_INCOMPLETE");
      expect(err.error.missing_stages).toEqual([2, 3, 4, 5]);
    });

    it("六阶段完成后确认收录 → approved + 阶段六落库 + 审计；重复点 promoted → 409", async () => {
      for (let s = 1; s <= 5; s++) {
        const r = await saveStage(s, { result: s === 4 ? "warn" : "pass", reviewer_note: `阶段 ${s} 检查完成` });
        expect(r.status).toBe(200);
      }
      const res = await fetchApi(
        `/api/curation/admin/candidates/${CID}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${OWNER_TOKEN}` },
          body: JSON.stringify({ action: "approve", note: "资料齐全，确认收录" }),
        },
        SITE,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("approved");

      const cand = await ctx.db
        .prepare(`SELECT status, status_reason FROM curation_candidates WHERE candidate_id = ?`)
        .bind(CID)
        .first<{ status: string; status_reason: string }>();
      expect(cand?.status).toBe("approved");
      expect(cand?.status_reason).toContain("确认收录");

      const stage6 = await ctx.db
        .prepare(`SELECT result FROM curation_reviews WHERE candidate_id = ? AND stage_index = 6`)
        .bind(CID)
        .first<{ result: string }>();
      expect(stage6?.result).toBe("pass");

      const decisionLog = await ctx.db
        .prepare(`SELECT COUNT(*) AS n FROM curation_audit_logs WHERE action = 'decision' AND target = ?`)
        .bind(CID)
        .first<{ n: number }>();
      expect(decisionLog?.n).toBe(1);

      // 已批准候选再次决策放行（幂等语义阶段四收紧），但 promoted 终态拒绝一切修改
      await ctx.db.prepare(`UPDATE curation_candidates SET status = 'promoted' WHERE candidate_id = ?`).bind(CID).run();
      const blocked = await fetchApi(
        `/api/curation/admin/candidates/${CID}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${OWNER_TOKEN}` },
          body: JSON.stringify({ action: "approve" }),
        },
        SITE,
      );
      expect(blocked.status).toBe(409);
      expect((await blocked.json()).error.code).toBe("CANDIDATE_PROMOTED");
    });

    it("拒绝 / 退回 / 暂不收录的状态流转与非法动作", async () => {
      const invalid = await fetchApi(
        `/api/curation/admin/candidates/${CID}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${OWNER_TOKEN}` },
          body: JSON.stringify({ action: "force-promote" }),
        },
        SITE,
      );
      expect(invalid.status).toBe(400);

      async function decide(action: string, note?: string): Promise<string> {
        const res = await fetchApi(
          `/api/curation/admin/candidates/${CID}/decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: `${COOKIE}=${OWNER_TOKEN}` },
            body: JSON.stringify({ action, note }),
          },
          SITE,
        );
        expect(res.status).toBe(200);
        const row = await ctx.db
          .prepare(`SELECT status FROM curation_candidates WHERE candidate_id = ?`)
          .bind(CID)
          .first<{ status: string }>();
        return row!.status;
      }

      expect(await decide("reject", "与精选库重复")).toBe("rejected");
      expect(await decide("return", "证据不足，重新核验")).toBe("pending_review");
      expect(await decide("hold", "等待新版本发布")).toBe("reviewing");
    });
  });

  /* ------------------------------ CORS / 公开接口回归 ------------------------------ */

  describe("CORS 凭据与公开接口回归", () => {
    it("白名单 Origin 的响应带 Allow-Credentials（Cookie 跨站必需）；预检含 PUT", async () => {
      const me = await fetchApi("/api/curation/admin/me", withOwnerCookie(), SITE);
      expect(me.headers.get("access-control-allow-origin")).toBe(SITE);
      expect(me.headers.get("access-control-allow-credentials")).toBe("true");

      const pre = await fetchApi(
        `/api/curation/admin/candidates/${CID}/reviews/1`,
        {
          method: "OPTIONS",
          headers: {
            Origin: SITE,
            "Access-Control-Request-Method": "PUT",
          },
        },
      );
      expect(pre.status).toBe(204);
      expect(pre.headers.get("access-control-allow-methods") || "").toContain("PUT");
      expect(pre.headers.get("access-control-allow-credentials")).toBe("true");
    });

    it("公开推荐 API 无需 Cookie、不受管理员逻辑影响", async () => {
      const res = await fetchApi("/api/curation/recommendations");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.items)).toBe(true);
    });
  });
});
