-- 精选推荐与人工收录审核数据层（任务书 §十四）
-- 独立于 evaluation_tasks / collection_submissions，不修改任何现有表
-- 只读关联两个候选池（live_multi.json 自动发现池 / submissions.candidates.json 社区池），
-- 推荐层不存储、不复制候选池原始数据（§4.3）

-- 14.1 推荐主记录（同一 GitHub 仓库只有一条，跨来源去重）
CREATE TABLE IF NOT EXISTS curation_candidates (
  candidate_id          TEXT PRIMARY KEY,           -- CUR-<hex>
  repo_slug             TEXT NOT NULL,              -- 标准化 owner/repo（小写，去 .git / 尾斜杠）
  repo_url              TEXT NOT NULL,
  tool_name             TEXT NOT NULL,
  description           TEXT,
  status                TEXT NOT NULL DEFAULT 'pending_review',
                        -- recommended / pending_review / reviewing / approved / promoted
                        -- / watching / not_recommended / rejected / blocked（§六 + 观察态）
  status_reason         TEXT,                       -- 状态原因（撤销 / 拦截 / 跌破门槛等）
  total_score           INTEGER,                    -- 最近一次综合评分（0-100）
  hard_check_status     TEXT,                       -- pass / fail
  hard_check_detail     TEXT,                       -- JSON：硬性检查逐项结果
  algorithm_version     TEXT NOT NULL,              -- 评分时的算法版本
  data_confidence       TEXT,                       -- ok / partial / insufficient
  first_recommended_at  INTEGER,                    -- 首次进入公开推荐时间
  last_evaluated_at     INTEGER,                    -- 最近评估时间（Unix 秒）
  promoted_at           INTEGER,                    -- 正式收录时间（阶段四）
  catalog_row_key       TEXT,                       -- 收录后精选库记录标识（阶段四）
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_curation_slug ON curation_candidates(repo_slug);
CREATE INDEX IF NOT EXISTS idx_curation_status ON curation_candidates(status, total_score DESC);
CREATE INDEX IF NOT EXISTS idx_curation_evaldue ON curation_candidates(status, last_evaluated_at);

-- 14.2 来源关联（只存关联，不复制候选池原始记录；一条主记录可挂多个来源）
CREATE TABLE IF NOT EXISTS curation_sources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id  TEXT NOT NULL,
  source_type   TEXT NOT NULL,        -- auto_discovery / community_submission
  source_ref    TEXT NOT NULL,        -- 自动发现池 repo_slug / 社区池 submission_id
  source_status TEXT,                 -- 来源记录当前状态（如 pending / active）
  linked_at     INTEGER NOT NULL,
  UNIQUE(candidate_id, source_type, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_curation_sources_candidate ON curation_sources(candidate_id);

-- 14.3 评分与依据快照（每次评估追加一行，可追溯）
CREATE TABLE IF NOT EXISTS curation_scores (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id      TEXT NOT NULL,
  total_score       INTEGER NOT NULL,
  dimensions        TEXT NOT NULL,    -- JSON：各维度 key/weight/score/evidence/confidence
  reason            TEXT NOT NULL,    -- 公开推荐理由（基于真实证据生成）
  data_confidence   TEXT NOT NULL,    -- ok / partial / insufficient
  scored_at         INTEGER NOT NULL,
  algorithm_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_curation_scores_candidate ON curation_scores(candidate_id, scored_at DESC);

-- 14.4 分阶段审核（阶段三写入；结构先建，审核进度持久化可恢复）
CREATE TABLE IF NOT EXISTS curation_reviews (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id  TEXT NOT NULL,
  stage_index   INTEGER NOT NULL,     -- 1-6（§十 六阶段）
  result        TEXT,                 -- pass / warn / fail（NULL=未检查）
  evidence      TEXT,                 -- JSON：检查证据
  checked_at    INTEGER,
  reviewer_note TEXT,                 -- 管理员意见
  updated_at    INTEGER NOT NULL,
  UNIQUE(candidate_id, stage_index)
);

-- 14.5 审计日志（操作不可篡改式追加）
CREATE TABLE IF NOT EXISTS curation_audit_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_login    TEXT,                -- 操作者（cron 为系统标识）
  action         TEXT NOT NULL,       -- evaluate / status_change / review / promote / ...
  target         TEXT NOT NULL,       -- 操作对象（repo_slug / candidate_id）
  result         TEXT NOT NULL,       -- ok / fail / denied
  failure_reason TEXT,
  request_id     TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_curation_audit_time ON curation_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_curation_audit_target ON curation_audit_logs(target, created_at DESC);
