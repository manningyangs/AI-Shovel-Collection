/**
 * 评测任务服务（任务书 §10.1 / §17.4 / §18.1）：
 *  - 提交：Session 校验 → Origin 校验 → URL 严格校验 → 幂等 → 频率限制
 *          → D1 建任务 → Installation Token 触发 workflow_dispatch → 保存 run_id
 *  - 查询：只允许任务所属用户读取；只读 D1，不查 GitHub（架构原则 8）
 */
import type { Context } from "hono";
import type { AppEnv, Env, SessionRow, TaskRow } from "./types";
import { ApiError, STAGE_TOTAL } from "./types";
import {
  bindRunId,
  countActiveTasks,
  findByIdempotencyKey,
  getOwnedTask,
  getRecentTaskWindow,
  insertTask,
  listTasksByUser,
  updateTaskStatus,
} from "./db";
import { dispatchEvalWorkflow, findRunByRequestId } from "./github-app";
import { newTaskId, validateRepoUrl } from "./security";
import { requireSession } from "./sessions";

const DAY_SECONDS = 86400;

/** 八阶段名（任务书 §十四；用于查询接口的 stage 字段） */
const STAGE_NAMES = [
  "", // 0 保留
  "request_accepted",
  "repo_validation",
  "repo_metadata",
  "structure_analysis",
  "static_analysis",
  "scoring",
  "report_generation",
  "report_publish",
];

/** Origin 白名单（由 index.ts 启动时注入，避免每请求重复 split） */
let originAllowList: string[] = [];
export function initOriginGuard(allowList: string[]): void {
  originAllowList = allowList;
}

/** 创建任务专用：Origin 必须存在且在白名单内（任务书 §10.1 第 2 步） */
function assertStrictOrigin(origin: string | undefined): void {
  if (!origin) throw new ApiError(403, "ORIGIN_MISSING", "缺少请求来源（Origin）");
  if (!originAllowList.includes(origin.replace(/\/+$/, ""))) {
    throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "请求来源不被允许");
  }
}

function taskResponse(row: TaskRow) {
  return {
    ...row,
    updated_at_iso: new Date(row.updated_at * 1000).toISOString(),
  };
}

/* ------------------------------ 创建任务 ------------------------------ */

export async function handleCreateEvaluation(c: Context<AppEnv>): Promise<Response> {
  const env = c.env;
  const session = await requireSession(env, c.req.header("Authorization"));

  assertStrictOrigin(c.req.header("Origin"));

  const body = (await c.req.json().catch(() => null)) as
    | { repo_url?: unknown; idempotency_key?: unknown }
    | null;
  if (!body) throw new ApiError(400, "INVALID_BODY", "请求体必须是 JSON");

  const repoRef = validateRepoUrl(body.repo_url);
  if (!repoRef) {
    throw new ApiError(
      400,
      "INVALID_REPO_URL",
      "仅支持 https://github.com/owner/repository 格式的公开仓库地址",
    );
  }
  const repoUrl = `https://github.com/${repoRef.owner}/${repoRef.repo}`;

  const idemKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.length > 0
      ? body.idempotency_key.slice(0, 100)
      : null;

  // 1) 幂等：同用户同 key 直接返回原任务，绝不重复触发 Workflow（§17.4）
  if (idemKey) {
    const existing = await findByIdempotencyKey(env, session.github_user_id, idemKey);
    if (existing) return idempotentResponse(c, existing);
  }

  // 2) 频率限制（可配置，任务书 §三：从 3 → 5；保留滚动 24h 语义）
  const dailyLimit = Number(env.RATE_DAILY_PER_USER) || 3;
  const { count: dailyUsed, earliestCreatedAt } = await getRecentTaskWindow(
    env,
    session.github_user_id,
    DAY_SECONDS,
  );
  if (dailyUsed >= dailyLimit) {
    // 滚动窗口：最早一笔创建满 24h 时释放一个名额
    const now = Math.floor(Date.now() / 1000);
    const retryAfter = earliestCreatedAt
      ? Math.max(0, earliestCreatedAt + DAY_SECONDS - now)
      : 0;
    const nextAvail = new Date((now + retryAfter) * 1000).toISOString();
    throw new ApiError(
      429,
      "DAILY_LIMIT_EXCEEDED",
      `过去 24 小时内已使用 ${dailyUsed}/${dailyLimit} 次评测额度，请在倒计时结束后再试`,
      {
        limit: dailyLimit,
        retry_after_seconds: retryAfter,
        next_available_at: nextAvail,
        window_seconds: DAY_SECONDS,
      },
    );
  }

  const activeSameRepo = await countActiveTasks(env, session.github_user_id, repoUrl);
  if (activeSameRepo >= 1) {
    throw new ApiError(409, "ACTIVE_REPO_EXISTS", "该仓库已有进行中的评测任务，请等待完成");
  }

  const queueLimit = Number(env.RATE_MAX_QUEUED_PER_USER) || 2;
  const activeTotal = await countActiveTasks(env, session.github_user_id);
  if (activeTotal >= queueLimit) {
    throw new ApiError(
      409,
      "QUEUE_LIMIT",
      `进行中的评测任务已达上限（${queueLimit} 个），请等待完成后再提交`,
    );
  }

  // 3) 建任务（status=dispatching 展示"正在触发评测流水线"）
  const taskId = newTaskId();
  const now = Math.floor(Date.now() / 1000);
  try {
    await insertTask(env, {
      task_id: taskId,
      requester_github_id: session.github_user_id,
      requester_github_login: session.github_login,
      repository_url: repoUrl,
      repository_owner: repoRef.owner,
      repository_name: repoRef.repo,
      status: "dispatching",
      stage_index: 1,
      stage_total: STAGE_TOTAL,
      stage_message: "请求已受理，正在触发评测流水线",
      progress_seq: 11, // stage1 受理已完成（seq = 1*10+1）
      idempotency_key: idemKey,
      created_at: now,
      updated_at: now,
    });
  } catch (e) {
    // 并发重复提交撞唯一索引 → 返回已存在任务
    if (idemKey) {
      const existing = await findByIdempotencyKey(env, session.github_user_id, idemKey);
      if (existing) return idempotentResponse(c, existing);
    }
    throw e;
  }

  // 4) 触发 Workflow（固定仓库 / 固定 Workflow，绝不接受外部指定）
  let dispatched = false;
  let runId: number | null = null;
  let responseLost = false;
  try {
    const r = await dispatchEvalWorkflow(env, repoUrl, taskId);
    dispatched = r.accepted;
    runId = r.runId;
  } catch (e) {
    if (e instanceof ApiError) {
      // GitHub 明确返回错误 → 失败终态（不盲目重试触发）
      await updateTaskStatus(env, taskId, "failed", e.message, "DISPATCH_FAILED");
      const failed = await getOwnedTask(env, taskId, session.github_user_id);
      return c.json({
        success: true, // 任务已创建；失败状态由 task 表达，前端进度面板直接展示
        request_id: taskId,
        status: "failed",
        message: e.message,
        task: failed ? taskResponse(failed) : undefined,
      });
    }
    // 网络层异常（响应可能已丢失）→ §18.1：先反查 run，绝不盲目重触发
    responseLost = true;
  }

  if (dispatched || responseLost) {
    // 反查 run_id（dispatch 响应未携带 / 响应丢失时）
    if (runId === null) {
      const found = await findRunByRequestId(env, taskId);
      if (found) runId = found.runId;
    }
    if (runId !== null) {
      // §18.2：bindRunId 只在 run_id 仍为空时写入，不覆盖回调已绑定的值
      await bindRunId(env, taskId, runId, null);
      await updateTaskStatus(env, taskId, "queued", "评测任务已提交，流水线排队中", null);
    } else {
      // §18.1：找不到 → dispatch_unknown 等待首个进度回调绑定 run_id
      await updateTaskStatus(env, taskId, "dispatch_unknown", "已触发评测，正在确认执行状态…", null);
    }
  }

  const task = await getOwnedTask(env, taskId, session.github_user_id);
  if (!task) throw new ApiError(500, "TASK_READ_FAILED", "任务创建后读取失败");
  return c.json({
    success: true,
    request_id: task.task_id,
    workflow_run_id: task.workflow_run_id,
    status: task.status,
    message: task.stage_message || "评测任务已成功提交",
    task: taskResponse(task),
  });
}

function idempotentResponse(c: Context<AppEnv>, row: TaskRow): Response {
  return c.json({
    success: true,
    idempotent: true,
    request_id: row.task_id,
    workflow_run_id: row.workflow_run_id,
    status: row.status,
    message: "该请求已受理（重复提交，未重复触发）",
    task: taskResponse(row),
  });
}

/* ------------------------------ 查询任务 ------------------------------ */

export async function handleGetEvaluation(c: Context<AppEnv>): Promise<Response> {
  const env = c.env;
  const session = await requireSession(env, c.req.header("Authorization"));
  const taskId = c.req.param("id") || "";

  // 归属校验：非本人任务一律 404（不暴露存在性，§10.2）
  const task = await getOwnedTask(env, taskId, session.github_user_id);
  if (!task) throw new ApiError(404, "NOT_FOUND", "评测任务不存在或无权查看");

  return c.json({
    success: true,
    task: taskResponse(task),
    request_id: task.task_id,
    repository:
      task.repository_owner && task.repository_name
        ? `${task.repository_owner}/${task.repository_name}`
        : task.repository_url,
    status: task.status,
    stage: STAGE_NAMES[task.stage_index] || "",
    stage_index: task.stage_index,
    stage_total: task.stage_total,
    message: task.stage_message,
    workflow_run_id: task.workflow_run_id,
    report_id: task.report_id,
    report_url: task.report_url,
    updated_at: new Date(task.updated_at * 1000).toISOString(),
  });
}

export async function handleListEvaluations(c: Context<AppEnv>): Promise<Response> {
  const env = c.env;
  const session = await requireSession(env, c.req.header("Authorization"));
  const tasks = await listTasksByUser(env, session.github_user_id, 10);
  return c.json({
    success: true,
    tasks: tasks.map((t) => taskResponse(t)),
  });
}
