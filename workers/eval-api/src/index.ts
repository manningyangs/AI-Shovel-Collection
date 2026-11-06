/**
 * Cloudflare Worker 入口（任务书 §七 路由 / §9 路由表 / §17 安全约束）。
 *
 * 路由一览：
 *  GET    /health                        健康检查
 *  GET    /auth/github/start             OAuth 授权开始（state + PKCE）
 *  GET    /auth/github/callback          GitHub 回调（重定向到站点 #ticket=）
 *  POST   /api/auth/exchange             一次性 Ticket 换 Session
 *  POST   /api/auth/logout               登出（撤销 Session）
 *  GET    /api/me                        当前登录用户
 *  POST   /api/evaluations               创建评测（Origin 必查）
 *  GET    /api/evaluations               我的任务列表
 *  GET    /api/evaluations/:id           任务进度详情
 *  GET    /api/curation/recommendations  精选推荐公开列表（只读白名单字段 §15.1）
 *  POST   /internal/progress             内部八阶段进度回调（HMAC）
 *  POST   /internal/finalize             内部终态回调（HMAC）
 *
 *  scheduled（Cron）：精选推荐周期评估（§十六；结果持久化 D1，首页零实时 GitHub 请求）
 *
 * 统一错误结构：{"success": false, "error": {"code", "message"}}（§9.7）
 */
import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "./types";
import { ApiError } from "./types";
import { allowedOrigins, corsHeadersFor } from "./security";
import {
  handleAuthCallback,
  handleAuthStart,
  handleExchange,
  handleLogout,
  handleMe,
} from "./oauth";
import {
  handleCreateEvaluation,
  handleGetEvaluation,
  handleListEvaluations,
  initOriginGuard,
} from "./evaluation-service";
import { handleFinalize, handleProgress } from "./progress-service";
import {
  handleCollectionCallback,
  handleCreateSubmission,
  handleGetSubmission,
  handleListSubmissions,
} from "./collection-service";
import { handleGetRecommendations, handleCurationScheduled } from "./curation/service";

const app = new Hono<AppEnv>();

/* ------------------------- CORS 白名单中间件（§17.7） ------------------------- */

app.use("*", async (c, next) => {
  const allow = allowedOrigins(c.env.ALLOWED_SITE_ORIGINS);
  initOriginGuard(allow);

  // 预检请求直接应答（仅对白名单 Origin 回显允许头）
  if (c.req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeadersFor(c.req.header("Origin"), allow),
    });
  }

  // /api/* 携带 Origin 时必须在白名单内（任务书 §17.7，防御性拦截）
  const origin = c.req.header("Origin");
  const path = new URL(c.req.url).pathname;
  if (path.startsWith("/api/") && origin && !allow.includes(origin.replace(/\/+$/, ""))) {
    return c.json(
      { success: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "请求来源不被允许" } },
      403,
      corsHeadersFor(origin, allow),
    );
  }

  await next();

  const extra = corsHeadersFor(c.req.header("Origin"), allow);
  if (Object.keys(extra).length > 0) {
    const merged = new Headers(c.res.headers);
    for (const [k, v] of Object.entries(extra)) {
      if (k.toLowerCase() === "vary") {
        const prev = merged.get("Vary");
        merged.set("Vary", prev ? `${prev}, Origin` : v);
      } else {
        merged.set(k, v);
      }
    }
    c.res = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers: merged,
    });
  }
});

/* -------------------------------- 健康检查 -------------------------------- */

app.get("/health", (c) =>
  c.json({
    success: true,
    service: "ai-shovel-eval-api",
    status: "ok",
    time: new Date().toISOString(),
  }),
);

/* -------------------------------- 登录链路 -------------------------------- */

app.get("/auth/github/start", handleAuthStart);
app.get("/auth/github/callback", handleAuthCallback);
app.post("/api/auth/exchange", handleExchange);
app.post("/api/auth/logout", handleLogout);
app.get("/api/me", handleMe);

/* ------------------------------- 评测任务 API ------------------------------- */

app.post("/api/evaluations", handleCreateEvaluation);
app.get("/api/evaluations", handleListEvaluations);
app.get("/api/evaluations/:id", handleGetEvaluation);

/* ----------------------------- 提交收录 API（任务书 §五） ----------------------------- */

app.post("/api/collection-submissions", handleCreateSubmission);
app.get("/api/collection-submissions", handleListSubmissions);
app.get("/api/collection-submissions/:id", handleGetSubmission);

/* ------------------------- 精选推荐公开 API（任务书 §十五.1） ------------------------- */

app.get("/api/curation/recommendations", handleGetRecommendations);

/* ------------------------------ 内部回调（HMAC / Bearer） ------------------------------ */

app.post("/internal/progress", handleProgress);
app.post("/internal/finalize", handleFinalize);
app.post("/internal/collection-submissions/status", handleCollectionCallback);

/* -------------------------------- 统一错误处理 -------------------------------- */

function corsNow(c: Context<AppEnv>): Record<string, string> {
  try {
    return corsHeadersFor(c.req.header("Origin"), allowedOrigins(c.env.ALLOWED_SITE_ORIGINS));
  } catch {
    return {};
  }
}

app.onError((err, c) => {
  const apiErr =
    err instanceof ApiError ? err : new ApiError(500, "INTERNAL_ERROR", "服务内部错误");
  if (!(err instanceof ApiError)) {
    // 不打印 env / 请求体，只记录错误消息（§17.6 日志禁止输出敏感数据）
    console.error("unhandled:", err?.message);
  }
  return c.json(
    {
      success: false,
      error: {
        code: apiErr.code,
        message: apiErr.message,
        ...(apiErr.extra ?? {}),
      },
    },
    apiErr.status as ContentfulStatusCode,
    corsNow(c),
  );
});

app.notFound((c) =>
  c.json(
    { success: false, error: { code: "NOT_FOUND", message: "接口不存在" } },
    404,
    corsNow(c),
  ),
);

/* ------------------------------ Cron：推荐周期评估（§十六） ------------------------------ */

const worker = {
  fetch: app.fetch,
  scheduled(
    _controller: ScheduledController,
    env: import("./types").Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    return handleCurationScheduled(env, _controller.cron ?? "manual");
  },
};

export default worker;
