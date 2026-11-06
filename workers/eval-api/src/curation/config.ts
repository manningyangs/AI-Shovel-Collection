/**
 * 精选推荐算法集中配置（任务书 §5.4）。
 * 门槛、权重、关键词、评估频率全部只在此文件定义，禁止散落到组件或服务层。
 */

/** 算法版本——每次评估随评分快照落库，可追溯 */
export const ALGORITHM_VERSION = "curation-1.0.0";

/** 100 分制权重（§5.4），七维合计必须为 100 */
export const SCORE_WEIGHTS = {
  ai_value: 20,
  completeness: 20,
  practical: 15,
  activity: 15,
  maturity: 10,
  community: 10,
  license: 10,
} as const;

export type DimensionKey = keyof typeof SCORE_WEIGHTS;

export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  ai_value: "AI 工具价值与相关性",
  completeness: "功能完整度",
  practical: "实用价值",
  activity: "项目活跃度",
  maturity: "技术成熟度",
  community: "社区认可度",
  license: "许可证与可持续性",
};

/** 推荐门槛（§5.4）：≥80 公开推荐；70-79 观察；<70 不推荐 */
export const THRESHOLDS = {
  PUBLIC_MIN: 80,
  WATCH_MIN: 70,
} as const;

/** 首页公开的推荐状态（§7.4，仅此四种） */
export const PUBLIC_STATUSES = [
  "recommended",
  "pending_review",
  "reviewing",
  "approved",
] as const;

export type CurationStatus =
  | "recommended" // 算法推荐通过（公开）
  | "pending_review" // 等待首次评估 / 人工审核（公开）
  | "reviewing" // 管理员审核中（公开）
  | "approved" // 人工批准待正式写入（公开）
  | "watching" // 观察状态：70-79 分或证据不足（不公开）
  | "not_recommended" // <70 分（不公开）
  | "promoted" // 已正式收录（不公开，且不参与淘汰 §八.6）
  | "rejected" // 人工拒绝（不公开，保留历史）
  | "blocked"; // 硬性条件不合格 / 重复（不公开）

export const PUBLIC_STATUS_SET: ReadonlySet<string> = new Set(PUBLIC_STATUSES);

/** AI 相关性关键词（硬性资格检查 §5.3；命中任一即视为 AI 相关信号） */
export const AI_KEYWORDS = [
  "ai", "a.i.", "llm", "gpt", "openai", "anthropic", "claude", "gemini", "ollama",
  "agent", "agentic", "mcp", "modelcontextprotocol", "machine-learning", "deep-learning",
  "chatbot", "rag", "embedding", "embeddings", "prompt", "copilot", "inference",
  "nlp", "computer-use", "autonomous", "generative", "diffusion", "stable-diffusion",
  "人工智能", "大模型", "智能体", "大语言模型",
];

/** 精选库收录认可的开源许可证（缺失→待核实；此列表决定收录门槛 §5.3/§十.4） */
export const ALLOWED_LICENSES = [
  "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "MPL-2.0",
  "GPL-2.0", "GPL-3.0", "AGPL-3.0", "LGPL-2.1", "LGPL-3.0", "Unlicense", "CC0-1.0",
  "Zlib", "BSL-1.0", "Artistic-2.0",
];

/** 评估运行参数（§十六 成本控制：限制 API 调用、只评到期候选） */
export const EVAL = {
  /** 每轮评估最多评多少个候选（防止单次运行过久） */
  MAX_CANDIDATES_PER_RUN: 120,
  /** 每轮最多调用多少次 GitHub API（匿名 60 次/小时，留余量） */
  MAX_API_CALLS_PER_RUN: 40,
  /** 重评周期：已评估超过该间隔的候选才会再次进入评估（§十六 定期复核） */
  REEVAL_INTERVAL_SECONDS: 24 * 3600,
} as const;

/** 两个候选池的容量上限（只读参照，用于统计校验；严禁改动池逻辑 §四） */
export const POOL_CAPS = {
  AUTO_DISCOVERY: 150,
  COMMUNITY_SUBMISSION: 500,
} as const;

/** 公开推荐列表单次返回上限 */
export const PUBLIC_LIST_LIMIT = 200;
