/**
 * 内部进度回调服务（任务书 §10.3 / §17.5 / §18.2）。
 *
 * 安全：
 *  - HMAC-SHA256(timestamp + "." + rawBody) 验签，5 分钟时间窗（原始字节参与签名）。
 *  - 携带 Origin 的浏览器请求一律拒绝（内部接口不对外暴露）。
 *  - progress_seq 单调递增：D1 条件更新，旧事件永远无法覆盖新进度。
 *  - request_id 不存在 → 404；workflow_run_id 已绑定为其他 run → 409。
 *
 * seq 规则（与 scripts/eval/progress_client.py 一致）：
 *  正常事件 seq = stage_index * 10 + kind（running=0 / completed=1）
 *  failed 终态 seq = 99999；finalize completed 终态 seq = 100000
 */
import type { Context } from "hono";
import type { AppEnv, Env, TaskRow } from "./types";
import { ApiError } from "./types";
import { bindRunId, getTask } from "./db";
import { verifyHmacSignature } from "./security";

const SEQ_FAILED = 99999;
const SEQ_FINAL = 100000;

interface ProgressPayload {
  request_id?: unknown;
  workflow_run_id?: unknown;
  run_attempt?: unknown;
  seq?: unknown;
  stage_index?: unknown;
  stage_total?: unknown;
  status?: unknown;
  message?: unknown;
  // finalize 专用（progress 不携带）
  report_id?: unknown;
  report_url?: unknown;
}

function asNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 清洗回调消息：去掉控制字符，长度与 progress_client 截断一致 */
function cleanMessage(v: unknown): string {
  if (typeof v !== "string") return "";
  let out = "";
  for (const ch of v) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? " " : ch;
  }
  return out.slice(0, 200);
}

/** 验签 + Origin 拦截的公共前置 */
async function preflight(c: Context<AppEnv>, rawBody: string): Promise<void> {
  if (c.req.header("Origin")) {
    // 浏览器（任何站点）都不允许访问内部接口
    throw new ApiError(403, "INTERNAL_FORBIDDEN", "内部接口不接受浏览器请求");
  }
  await verifyHmacSignature(
    c.env.EVAL_PROGRESS_SECRET,
    rawBody,
    c.req.header("X-Eval-Timestamp"),
    c.req.header("X-Eval-Signature"),
  );
}

async function loadTask(env: Env, requestId: unknown): Promise<TaskRow> {
  if (typeof requestId !== "string" || !/^EV-[A-Za-z0-9_-]{1,64}$/.test(requestId)) {
    throw new ApiError(400, "INVALID_REQUEST_ID", "request_id 非法");
  }
  const task = await getTask(env, requestId);
  if (!task) throw new ApiError(404, "UNKNOWN_REQUEST", "request_id 对应任务不存在");
  return task;
}

/**
 * 绑定校验（§18.2）：回调先到、dispatch 结果后到的场景，
 * 首个带 run_id 的回调可写入；已绑定不同 run_id 的回调被拒绝（409）。
 */
async function checkRunBinding(
  env: Env,
  task: TaskRow,
  runId: number | null,
  attempt: number | null,
): Promise<void> {
  if (runId === null) return; // 未携带 run_id → 不做绑定
  if (task.workflow_run_id === null) {
    await bindRunId(env, task.task_id, runId, attempt); // 仅当仍为空时写入
    return;
  }
  if (task.workflow_run_id !== runId) {
    throw new ApiError(
      409,
      "RUN_MISMATCH",
      `workflow_run_id 与已绑定记录不一致（task=${task.workflow_run_id}, payload=${runId}）`,
    );
  }
}

interface UpdateSpec {
  status: string;
  stageIndex: number;
  stageTotal: number;
  message: string;
  seq: number;
  runAttempt: number | null;
  errorCode?: string | null;
  reportId?: string | null;
  reportUrl?: string | null;
}

/** 条件更新：progress_seq 单调 + completed 不可回退。返回是否真正生效。 */
async function applyUpdate(env: Env, next: UpdateSpec, taskId: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const res = await env.DB.prepare(
    `UPDATE evaluation_tasks
     SET status = ?,
         stage_index = ?,
         stage_total = ?,
         stage_message = ?,
         progress_seq = ?,
         run_attempt = COALESCE(?, run_attempt),
         error_code = COALESCE(?, error_code),
         report_id = COALESCE(?, report_id),
         report_url = COALESCE(?, report_url),
         updated_at = ?
     WHERE task_id = ?
       AND progress_seq < ?
       AND status != 'completed'`,
  )
    .bind(
      next.status,
      next.stageIndex,
      next.stageTotal,
      next.message,
      next.seq,
      next.runAttempt,
      next.errorCode ?? null,
      next.reportId ?? null,
      next.reportUrl ?? null,
      now,
      taskId,
      next.seq,
    )
    .run();
  return (res.meta.changes ?? 0) > 0;
}

/* --------------------------- /internal/progress --------------------------- */

export async function handleProgress(c: Context<AppEnv>): Promise<Response> {
  const rawBody = await c.req.text();
  await preflight(c, rawBody);

  let payload: ProgressPayload;
  try {
    payload = JSON.parse(rawBody) as ProgressPayload;
  } catch {
    throw new ApiError(400, "INVALID_PAYLOAD", "请求体不是合法 JSON");
  }

  const status = typeof payload.status === "string" ? payload.status : "";
  if (!["running", "completed", "failed"].includes(status)) {
    throw new ApiError(400, "INVALID_STATUS", "status 必须是 running / completed / failed");
  }

  const task = await loadTask(c.env, payload.request_id);
  const runId =
    payload.workflow_run_id === null || payload.workflow_run_id === undefined
      ? null
      : asNum(payload.workflow_run_id, -1);
  const runAttempt =
    payload.run_attempt === null || payload.run_attempt === undefined
      ? null
      : asNum(payload.run_attempt, 1);
  await checkRunBinding(c.env, task, runId !== null && runId > 0 ? runId : null, runAttempt);

  // 终态保护：completed 之后任何事件一律忽略（200 + ignored，避免客户端重试）
  if (task.status === "completed") {
    return c.json({ success: true, ignored: true });
  }

  const stage = asNum(payload.stage_index, 0);
  const stageTotal = asNum(payload.stage_total, 8) || 8;
  const message = cleanMessage(payload.message);
  const seq = asNum(payload.seq, 0);

  let next: UpdateSpec;
  if (status === "failed") {
    // stage_index=0 表示"保留当前阶段"（progress_client fail --stage 0 约定）
    next = {
      status: "failed",
      stageIndex: stage >= 1 ? stage : task.stage_index,
      stageTotal,
      message: message || "评测失败",
      seq: SEQ_FAILED, // 终态用权威 seq，覆盖客户端任意值
      runAttempt,
      errorCode: "WORKFLOW_FAILED",
    };
  } else if (status === "completed") {
    // 阶段完成 → 推进到下一阶段（stage7 完成 → stage8 报告发布 publishing）
    const advanced = Math.min(stage + 1, 8);
    next = {
      status: advanced >= 8 ? "publishing" : "running",
      stageIndex: stage >= 1 ? advanced : task.stage_index,
      stageTotal,
      message: message || "阶段完成",
      seq,
      runAttempt,
    };
  } else {
    // running：stage_index 即当前进行阶段；stage8 → 报告发布中
    const current = stage >= 1 ? Math.min(stage, 8) : task.stage_index;
    next = {
      status: current >= 8 ? "publishing" : "running",
      stageIndex: current,
      stageTotal,
      message: message || "评测进行中",
      seq,
      runAttempt,
    };
  }

  const applied = await applyUpdate(c.env, next, task.task_id);
  // 旧事件 / 重复事件：条件更新未命中 → applied=false（旧进度不会覆盖新进度）
  return c.json({ success: true, applied });
}

/* --------------------------- /internal/finalize --------------------------- */

export async function handleFinalize(c: Context<AppEnv>): Promise<Response> {
  const rawBody = await c.req.text();
  await preflight(c, rawBody);

  let payload: ProgressPayload;
  try {
    payload = JSON.parse(rawBody) as ProgressPayload;
  } catch {
    throw new ApiError(400, "INVALID_PAYLOAD", "请求体不是合法 JSON");
  }

  const status = typeof payload.status === "string" ? payload.status : "";
  if (!["completed", "failed"].includes(status)) {
    throw new ApiError(400, "INVALID_STATUS", "finalize status 必须是 completed / failed");
  }

  const task = await loadTask(c.env, payload.request_id);
  // 注意：finalize 由 pages-astro.yml 的独立 Run 回调，其 workflow_run_id 与评测 Run
  // 天然不同，因此 finalize 不做 run_id 绑定比较（progress 已完成绑定校验）。
  const message = cleanMessage(payload.message);
  const reportId = typeof payload.report_id === "string" ? payload.report_id : "";
  const reportUrl = typeof payload.report_url === "string" ? payload.report_url : "";

  if (task.status === "completed") {
    return c.json({ success: true, ignored: true });
  }

  if (status === "failed") {
    const applied = await applyUpdate(
      c.env,
      {
        status: "failed",
        stageIndex: task.stage_index, // 保留当前阶段
        stageTotal: task.stage_total,
        message: message || "报告发布失败",
        seq: SEQ_FAILED,
        runAttempt: null,
        errorCode: "PUBLISH_FAILED",
        reportId: reportId || null,
        reportUrl: reportUrl || null,
      },
      task.task_id,
    );
    return c.json({ success: true, applied });
  }

  // ---- completed：必须报告真实可访问（任务书 §15.2 / §二十验收） ----
  if (!reportId || !reportUrl) {
    throw new ApiError(422, "MISSING_REPORT", "finalize completed 必须携带 report_id 与 report_url");
  }
  const expectedPrefix = c.env.PUBLIC_SITE_BASE_URL.replace(/\/+$/, "") + "/evaluations/";
  if (!reportUrl.startsWith(expectedPrefix)) {
    // 报告地址必须落在本站点报告目录下（防 SSRF / 伪造地址）
    throw new ApiError(422, "INVALID_REPORT_URL", "report_url 不是本站点报告地址");
  }

  // 真实 HTTP 200 校验（网络错误 → 502 让客户端有限重试）
  let live: Response;
  try {
    live = await fetch(reportUrl, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "ai-shovel-eval-finalize-check", Accept: "text/html" },
    });
  } catch {
    throw new ApiError(502, "REPORT_CHECK_RETRY", "报告页可访问性检查网络失败，请重试回调");
  }
  if (live.status !== 200) {
    throw new ApiError(
      422,
      "REPORT_NOT_AVAILABLE",
      `报告页当前返回 HTTP ${live.status}，暂不能标记完成`,
    );
  }

  const applied = await applyUpdate(
    c.env,
    {
      status: "completed",
      stageIndex: 8,
      stageTotal: 8,
      message: message || "评测完成，报告已发布",
      seq: SEQ_FINAL,
      runAttempt: null,
      errorCode: null,
      reportId,
      reportUrl,
    },
    task.task_id,
  );
  return c.json({ success: true, applied, report_url: reportUrl });
}
