/**
 * D1 任务表访问封装（evaluation_tasks）。
 * 所有任务状态的唯一权威读写入口（任务书 §一 架构原则 7）。
 */
import type { Env, TaskRow, TaskStatus } from "./types";

export const TASK_COLUMNS = `
  task_id, requester_github_id, requester_github_login, repository_url,
  repository_owner, repository_name, status, stage_index, stage_total,
  stage_message, progress_seq, workflow_run_id, run_attempt, idempotency_key,
  report_id, report_url, error_code, created_at, updated_at
`;

export async function getTask(env: Env, taskId: string): Promise<TaskRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${TASK_COLUMNS} FROM evaluation_tasks WHERE task_id = ?`,
  )
    .bind(taskId)
    .first<TaskRow>();
  return row ?? null;
}

/** 按归属查询（用户只能读自己的任务，任务书 §10.2） */
export async function getOwnedTask(
  env: Env,
  taskId: string,
  requesterId: number,
): Promise<TaskRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${TASK_COLUMNS} FROM evaluation_tasks WHERE task_id = ? AND requester_github_id = ?`,
  )
    .bind(taskId, requesterId)
    .first<TaskRow>();
  return row ?? null;
}

export async function insertTask(
  env: Env,
  task: Pick<
    TaskRow,
    | "task_id"
    | "requester_github_id"
    | "requester_github_login"
    | "repository_url"
    | "repository_owner"
    | "repository_name"
    | "status"
    | "stage_index"
    | "stage_total"
    | "stage_message"
    | "progress_seq"
    | "idempotency_key"
    | "created_at"
    | "updated_at"
  >,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO evaluation_tasks (
       task_id, requester_github_id, requester_github_login, repository_url,
       repository_owner, repository_name, status, stage_index, stage_total,
       stage_message, progress_seq, idempotency_key, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      task.task_id,
      task.requester_github_id,
      task.requester_github_login,
      task.repository_url,
      task.repository_owner,
      task.repository_name,
      task.status,
      task.stage_index,
      task.stage_total,
      task.stage_message,
      task.progress_seq,
      task.idempotency_key,
      task.created_at,
      task.updated_at,
    )
    .run();
}

export async function listTasksByUser(env: Env, requesterId: number, limit = 10) {
  const res = await env.DB.prepare(
    `SELECT ${TASK_COLUMNS} FROM evaluation_tasks
     WHERE requester_github_id = ?
     ORDER BY created_at DESC LIMIT ?`,
  )
    .bind(requesterId, limit)
    .all<TaskRow>();
  return res.results ?? [];
}

/** 幂等键查询：同用户同 key 只允许一个任务（任务书 §17.4） */
export async function findByIdempotencyKey(
  env: Env,
  requesterId: number,
  key: string,
): Promise<TaskRow | null> {
  const row = await env.DB.prepare(
    `SELECT ${TASK_COLUMNS} FROM evaluation_tasks
     WHERE requester_github_id = ? AND idempotency_key = ?`,
  )
    .bind(requesterId, key)
    .first<TaskRow>();
  return row ?? null;
}

/** 频率限制统计 */
export async function countRecentTasks(
  env: Env,
  requesterId: number,
  sinceSecondsAgo: number,
): Promise<number> {
  const since = Math.floor(Date.now() / 1000) - sinceSecondsAgo;
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM evaluation_tasks
     WHERE requester_github_id = ? AND created_at >= ?`,
  )
    .bind(requesterId, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * 同时间窗口的"计数 + 最早一笔创建时间"联合查询。
 * 供每日额度超限时计算 retry_after_seconds 用：
 *   earliest_created_at + 86400 - now  = 距离最早一笔任务满 24h 的剩余秒数
 * 时间单位与 countRecentTasks 一致：D1 记录为 Unix 秒。
 */
export async function getRecentTaskWindow(
  env: Env,
  requesterId: number,
  sinceSecondsAgo: number,
): Promise<{ count: number; earliestCreatedAt: number | null }> {
  const since = Math.floor(Date.now() / 1000) - sinceSecondsAgo;
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n, MIN(created_at) AS earliest
     FROM evaluation_tasks
     WHERE requester_github_id = ? AND created_at >= ?`,
  )
    .bind(requesterId, since)
    .first<{ n: number; earliest: number | null }>();
  return { count: row?.n ?? 0, earliestCreatedAt: row?.earliest ?? null };
}

export async function countActiveTasks(
  env: Env,
  requesterId: number,
  repositoryUrl?: string,
): Promise<number> {
  const activeList = ["queued", "dispatching", "dispatch_unknown", "running", "publishing"];
  const placeholders = activeList.map(() => "?").join(",");
  if (repositoryUrl) {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM evaluation_tasks
       WHERE requester_github_id = ? AND repository_url = ? AND status IN (${placeholders})`,
    )
      .bind(requesterId, repositoryUrl, ...activeList)
      .first<{ n: number }>();
    return row?.n ?? 0;
  }
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM evaluation_tasks
     WHERE requester_github_id = ? AND status IN (${placeholders})`,
  )
    .bind(requesterId, ...activeList)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * 绑定 Workflow Run ID（任务书 §18.2）：
 * 仅当当前 run_id 为空时写入；若已被回调绑定为其他 run_id，则不覆盖。
 * 返回 true 表示本次绑定成功。
 */
export async function bindRunId(
  env: Env,
  taskId: string,
  runId: number,
  runAttempt: number | null,
): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE evaluation_tasks
     SET workflow_run_id = ?, run_attempt = COALESCE(?, run_attempt), updated_at = ?
     WHERE task_id = ? AND workflow_run_id IS NULL`,
  )
    .bind(runId, runAttempt, Math.floor(Date.now() / 1000), taskId)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function updateTaskStatus(
  env: Env,
  taskId: string,
  status: TaskStatus,
  message: string | null,
  errorCode: string | null,
): Promise<void> {
  await env.DB.prepare(
    `UPDATE evaluation_tasks
     SET status = ?, stage_message = COALESCE(?, stage_message), error_code = ?,
         updated_at = ?
     WHERE task_id = ?`,
  )
    .bind(status, message, errorCode, Math.floor(Date.now() / 1000), taskId)
    .run();
}

/** 把 D1 行转换为前端 / API 输出（保持 snake_case，与前端契约一致） */
export function taskToApi(row: TaskRow) {
  const now = row.updated_at;
  return {
    ...row,
    updated_iso: new Date(now * 1000).toISOString(),
  };
}
