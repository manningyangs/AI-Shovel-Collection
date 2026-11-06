-- 正式收录流程状态（任务书 §12.3 幂等与并发 / §12.4 失败恢复，阶段四）
-- 一行对应一次「写入精选库」流程；candidate_id 主键天然保证同一候选只有一条流程记录：
--   写入成功但后续同步失败时，靠本表识别已完成步骤 → 安全重试剩余步骤（不重复写精选文件）
CREATE TABLE IF NOT EXISTS curation_promotions (
  candidate_id     TEXT PRIMARY KEY,           -- 关联 curation_candidates.candidate_id
  repo_slug        TEXT NOT NULL,              -- 标准化 owner/repo
  state            TEXT NOT NULL,              -- writing（已触发写入）/ written（精选已写入）/ synced（全部同步完成）/ failed
  category         TEXT,                       -- 写入 catalog.csv 的分类
  catalog_row_key  TEXT,                       -- 精选库记录标识（category::slug）
  workflow_run_id  INTEGER,                    -- 触发的 Actions run（dispatch 返回时记录，可为空）
  error            TEXT,                       -- 最近一次失败原因
  attempts         INTEGER NOT NULL DEFAULT 0, -- 收录尝试次数（含重试）
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_curation_promotions_state ON curation_promotions(state, updated_at);
