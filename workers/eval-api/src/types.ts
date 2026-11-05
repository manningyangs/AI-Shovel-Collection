/** 环境变量与共享类型 */

export interface Env {
  DB: D1Database;
  // Secrets（wrangler secret put）
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_CLIENT_SECRET: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_INSTALLATION_ID: string;
  EVAL_PROGRESS_SECRET: string;
  // Vars（wrangler.jsonc）
  GITHUB_APP_ID: string;
  GITHUB_API_REPOSITORY: string;
  GITHUB_WORKFLOW_FILE: string;
  PUBLIC_SITE_BASE_URL: string;
  ALLOWED_SITE_ORIGINS: string;
  RATE_DAILY_PER_USER: string;
  RATE_MAX_ACTIVE_PER_REPO: string;
  RATE_MAX_QUEUED_PER_USER: string;
  SESSION_TTL_SECONDS: string;
}

export type TaskStatus =
  | "queued"
  | "dispatching"
  | "dispatch_unknown"
  | "running"
  | "publishing"
  | "completed"
  | "failed"
  | "cancelled";

export const TERMINAL_STATUSES: TaskStatus[] = ["completed", "cancelled"];
// dispatch_unknown 也算进行中（任务书 §18.1：触发结果待确认，仍占队列额度）
export const ACTIVE_STATUSES: TaskStatus[] = [
  "queued",
  "dispatching",
  "dispatch_unknown",
  "running",
  "publishing",
];
export const STAGE_TOTAL = 8;

export interface TaskRow {
  task_id: string;
  requester_github_id: number;
  requester_github_login: string | null;
  repository_url: string;
  repository_owner: string | null;
  repository_name: string | null;
  status: TaskStatus;
  stage_index: number;
  stage_total: number;
  stage_message: string | null;
  progress_seq: number;
  workflow_run_id: number | null;
  run_attempt: number | null;
  idempotency_key: string | null;
  report_id: string | null;
  report_url: string | null;
  error_code: string | null;
  created_at: number;
  updated_at: number;
}

export interface SessionRow {
  token_hash: string;
  github_user_id: number;
  github_login: string;
  created_at: number;
  expires_at: number;
  revoked: number;
}

/** 统一错误响应结构 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** 机器可读扩展字段（如 limit/retry_after_seconds/next_available_at 等） */
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function errJson(e: ApiError) {
  return {
    success: false as const,
    error: { code: e.code, message: e.message, ...(e.extra ?? {}) },
  };
}

/** Hono 应用环境：Worker 绑定（DB + Secrets + Vars）挂在 Bindings 下 */
export type AppEnv = { Bindings: Env };
