// AI Tool Map 共享类型（与 scripts/build_tool_map.py 输出的 tool-map.json 对应）

export type EvalInfo = {
  score?: number | null;
  grade?: string;
  level?: string;
  status?: string;
  reportId?: string;
} | null;

export type MapNodeData = {
  id: string;
  name: string;
  category: string;
  capability: string;
  desc?: string;
  stars?: number | null;
  lang?: string;
  pushedAt?: string;
  status?: string;
  eval?: EvalInfo;
  detailUrl: string;
  capabilities: string[];
  mapGroup: string;
  summary?: string;
  position: { x: number; y: number };
};

export type RelationType = 'integration' | 'protocol' | 'complementary' | 'alternative';
export type EvidenceLevel = 'verified' | 'documented' | 'inferred' | 'unverified';

export type RelationData = {
  id: string;
  source: string;
  target: string;
  type: RelationType;
  evidenceLevel: EvidenceLevel;
  description: string;
  evidence?: { type: string; url: string }[];
  updatedAt?: string;
};

export type CapabilityDef = {
  id: string;
  name: string;
  description: string;
  category: string;
};

/** 候选关系（relation-candidates.json，非公共事实，默认不展示） */
export type CandidateRelation = RelationData & {
  direction?: string;
  status?: string;
  inputOutputMatch?: string;
  protocolMatch?: string;
  setupRequired?: string;
  displayByDefault?: boolean;
  reviewNote?: string;
  importedAt?: string;
};

/** 工具输入输出能力画像（io-capabilities.json；空数组 = unknown） */
export type IOProfile = {
  repo: string;
  operations: string[];
  inputs: string[];
  outputs: string[];
  protocols: string[];
  constraints: string[];
  explicitInputs?: string[];
  explicitOutputs?: string[];
  evidence?: { type: string; url: string }[];
  evidenceLevel: string;
  summary?: string;
};

/** 连接检查结果（任务书 §8.1 五种状态） */
export type CheckStatus = 'verified' | 'documented' | 'logical' | 'conflict' | 'unknown';

export type CheckDimensionState = 'pass' | 'warn' | 'fail' | 'unknown';

export type CheckDimension = {
  label: string;
  state: CheckDimensionState;
  detail: string;
};

export type BridgeTool = { id: string; name: string; reason: string };

export type ConnectionCheck = {
  status: CheckStatus;
  /** 一句话结论 */
  conclusion: string;
  dimensions: {
    taskLogic: CheckDimension;
    ioCompat: CheckDimension;
    protocol: CheckDimension;
    integration: CheckDimension;
    runtime: CheckDimension;
  };
  /** 分维度解释（任务书 §8.3 必须解释原因，不能只说失败） */
  reasons: string[];
  suggestions: string[];
  /** 命中的公共关系 */
  relation?: { id: string; type: RelationType; evidenceLevel: EvidenceLevel; description: string; source: string; target: string };
  /** 命中的候选关系（未审核） */
  candidate?: { id: string; type: RelationType; evidenceLevel: EvidenceLevel; description: string; reviewNote?: string };
  /** 画像证据摘要 */
  ioEvidence?: { sourceOutputs: string[]; targetInputs: string[]; sourceLevel: string; targetLevel: string };
  /** 推荐的中间转换工具（io 冲突或无交集时） */
  bridges?: BridgeTool[];
};

/** 检查状态视觉规范（任务书 §11：不能仅靠颜色，界面同时给文字标签） */
export const CHECK_STYLE: Record<CheckStatus, { color: string; label: string; symbol: string }> = {
  verified: { color: '#16a34a', label: '已验证连接', symbol: '✓' },
  documented: { color: '#2563eb', label: '文档支持', symbol: '✓' },
  logical: { color: '#d97706', label: '逻辑合理·待验证', symbol: '!' },
  conflict: { color: '#dc2626', label: '存在冲突', symbol: '×' },
  unknown: { color: '#64748b', label: '信息不足', symbol: '?' },
};

export type WorkflowTemplateStep = {
  tool: string;
  desc: string;
  input: string;
  output: string;
  needsManual: boolean;
  needsConfig: boolean;
  configNote?: string;
  verified: boolean;
  verifyNote?: string;
};

export type WorkflowTemplate = {
  id: string;
  title: string;
  steps: WorkflowTemplateStep[];
};

export type MapData = {
  generatedAt: string;
  stats: Record<string, unknown>;
  capabilities: CapabilityDef[];
  nodes: MapNodeData[];
  relations: RelationData[];
  candidates?: CandidateRelation[];
  ioProfiles?: Record<string, IOProfile>;
  templates?: WorkflowTemplate[];
};

/** 关系类型视觉规范（任务书 §8：四类关系不同颜色线型） */
export const REL_STYLE: Record<RelationType, { color: string; dashed: boolean; label: string }> = {
  integration: { color: '#3b82f6', dashed: false, label: '集成' },
  protocol: { color: '#22c55e', dashed: false, label: '协议兼容' },
  complementary: { color: '#a855f7', dashed: true, label: '互补' },
  alternative: { color: '#f97316', dashed: true, label: '替代' },
};

export const EVIDENCE_LABEL: Record<EvidenceLevel, string> = {
  verified: '已验证',
  documented: '文档支持',
  inferred: '推断',
  unverified: '证据不足',
};

/** 能力域配色（按 capabilities 顺序稳定分配） */
export function capColor(index: number): string {
  const palette = [
    '#6366f1', '#0ea5e9', '#f59e0b', '#22c55e', '#8b5cf6', '#ef4444',
    '#14b8a6', '#ec4899', '#f97316', '#e11d48', '#a855f7', '#0891b2',
    '#16a34a', '#d946ef', '#dc2626', '#7c3aed', '#0d9488',
  ];
  return palette[index % palette.length];
}
