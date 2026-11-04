-- AI Shovel Eval Worker — 初始表结构
-- oauth_states / login_tickets / sessions / evaluation_tasks

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash           TEXT PRIMARY KEY,
  verifier             TEXT NOT NULL,
  return_to            TEXT,
  created_at           INTEGER NOT NULL,
  expires_at           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS login_tickets (
  ticket_hash          TEXT PRIMARY KEY,
  github_user_id       INTEGER NOT NULL,
  github_login         TEXT NOT NULL,
  created_at           INTEGER NOT NULL,
  expires_at           INTEGER NOT NULL,
  used                 INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash           TEXT PRIMARY KEY,
  github_user_id       INTEGER NOT NULL,
  github_login         TEXT NOT NULL,
  created_at           INTEGER NOT NULL,
  expires_at           INTEGER NOT NULL,
  revoked              INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evaluation_tasks (
  task_id                TEXT PRIMARY KEY,
  requester_github_id    INTEGER NOT NULL,
  requester_github_login TEXT,
  repository_url         TEXT NOT NULL,
  repository_owner       TEXT,
  repository_name        TEXT,
  status                 TEXT NOT NULL DEFAULT 'queued',
  stage_index            INTEGER NOT NULL DEFAULT 1,
  stage_total            INTEGER NOT NULL DEFAULT 8,
  stage_message          TEXT,
  progress_seq           INTEGER NOT NULL DEFAULT 11,
  workflow_run_id        INTEGER,
  run_attempt            INTEGER,
  idempotency_key        TEXT,
  report_id              TEXT,
  report_url             TEXT,
  error_code             TEXT,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_requester_idem
  ON evaluation_tasks(requester_github_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eval_requester ON evaluation_tasks(requester_github_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_status_repo ON evaluation_tasks(status, repository_url);
CREATE INDEX IF NOT EXISTS idx_eval_run ON evaluation_tasks(workflow_run_id);
