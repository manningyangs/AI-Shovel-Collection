/** 环境变量与共享类型 */

export interface Env {
  DB: D1Database;
  // Secrets（wrangler secret put）
  GITHUB_APP_CLIENT_ID: string;
  GITHUB_APP_CLIENT_SECRET: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_APP_INSTALLATION_ID: string;
  EVAL_PROGRESS_SECRET: string;
  // —— 提交收录改造新增（任务书 §八）——
  COLLECTION_CALLBACK_SECRET: string;  // Worker ↔ collection-submission.yml 回调共享
  COLLECTION_IP_SALT: string;          // HMAC(客户端 IP) 摘要盐，不明文存 IP
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
  // —— 提交收录改造新增 vars ——
  COLLECTION_WORKFLOW_FILE: string;         // collection-submission.yml
  COLLECTION_RATE_DAILY_PER_IP: string;      // 5 (任务书 §5.5)
  // —— 阶段四正式收录新增 vars（可选，缺省用代码内默认值）——
  CURATION_WORKFLOW_FILE?: string;           // curation-promote.yml（独立收录写入工作流，冲突方案 C2）
  PROMOTE_VERIFY_ATTEMPTS?: string;          // 触发写入后就地等待验证的次数（测试调小）
  PROMOTE_VERIFY_INTERVAL_MS?: string;       // 验证等待间隔（测试调小）
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
