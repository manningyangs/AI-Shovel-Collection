-- AI Shovel Collection — 用户提交收录任务表（Worker 提交收录改造）
-- 与现有 evaluation_tasks 完全独立，互不影响

CREATE TABLE IF NOT EXISTS collection_submissions (
  submission_id        TEXT PRIMARY KEY,        -- 随机提交编号（十六进制 + base62 混合，不递增）
  repo_owner           TEXT NOT NULL,
  repo_name            TEXT NOT NULL,
  canonical_repo       TEXT NOT NULL,           -- owner/repo 规范化标识，查重用
  repo_url             TEXT NOT NULL,
  reason               TEXT,                    -- 用户推荐理由（可选，≤500 字）
  status               TEXT NOT NULL DEFAULT 'queued',
  status_message       TEXT,
  failure_code         TEXT,
  workflow_run_id      INTEGER,                 -- GitHub Actions run_id（可选）
  requester_hash       TEXT,                    -- HMAC(客户端 IP, COLLECTION_IP_KEY) — 匿名限流
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL,
  completed_at         INTEGER,
  duplicate_of         TEXT                     -- 如果是重复收录，指向已有 submissions.id 或 "catalog" / "candidates" / "inbox"
);

CREATE INDEX IF NOT EXISTS idx_collect_repo ON collection_submissions(canonical_repo, status);
CREATE INDEX IF NOT EXISTS idx_collect_requester ON collection_submissions(requester_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collect_status ON collection_submissions(status, created_at DESC);
