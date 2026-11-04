// 连接合理性检查器（任务书 §8）：浏览器端确定性规则，无后端、无 LLM。
// 判定分五个维度：任务逻辑 / 输入输出 / 协议 / 直接集成证据 / 实际运行验证，
// 维度不混为一谈；任何 unknown 都如实呈现，不虚报兼容。
import type {
  CandidateRelation,
  CheckStatus,
  ConnectionCheck,
  IOProfile,
  MapData,
  MapNodeData,
  RelationData,
  WorkflowTemplate,
} from './types';

export type CheckerIndex = {
  nodes: Map<string, MapNodeData>;
  official: Map<string, RelationData>;
  candidates: Map<string, CandidateRelation>;
  io: Record<string, IOProfile>;
  templates: WorkflowTemplate[];
};

const TEXT_FAMILY = ['text', 'markdown', 'html'];

export function pairKey(a: string, b: string): string {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort();
  return `${x}::${y}`;
}

export function buildCheckerIndex(data: MapData): CheckerIndex {
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const official = new Map<string, RelationData>();
  for (const r of data.relations) official.set(pairKey(r.source, r.target), r);
  const candidates = new Map<string, CandidateRelation>();
  for (const c of data.candidates ?? []) candidates.set(pairKey(c.source, c.target), c);
  return {
    nodes,
    official,
    candidates,
    io: data.ioProfiles ?? {},
    templates: data.templates ?? [],
  };
}

/** 数据能否从 out 直接流向 in（同 token 直接匹配；text 家族视为需转换的弱匹配） */
function canFlow(outTok: string, inTok: string): 'exact' | 'family' | null {
  if (outTok === inTok) return 'exact';
  if (TEXT_FAMILY.includes(outTok) && TEXT_FAMILY.includes(inTok)) return 'family';
  return null;
}

type IoState = 'match' | 'convert' | 'conflict' | 'unknown';

function evaluateIo(sourceOut: string[], targetIn: string[]): { state: IoState; detail: string; matched?: string } {
  if (!sourceOut.length || !targetIn.length) {
    return { state: 'unknown', detail: '一端缺少输入输出画像，无法判断格式兼容性' };
  }
  let hasFamily = false;
  for (const o of sourceOut) {
    for (const i of targetIn) {
      const r = canFlow(o, i);
      if (r === 'exact') return { state: 'match', detail: `输出「${o}」直接满足输入「${i}」`, matched: o };
      if (r === 'family') hasFamily = true;
    }
  }
  if (hasFamily) {
    const o = sourceOut.find((x) => TEXT_FAMILY.includes(x));
    const i = targetIn.find((x) => TEXT_FAMILY.includes(x));
    return { state: 'convert', detail: `输出「${o}」与输入「${i}」同属文本家族，建议先做格式转换`, matched: o };
  }
  return {
    state: 'conflict',
    detail: `源输出（${sourceOut.join('、')}）与目标输入（${targetIn.join('、')}）没有交集`,
  };
}

/** 找中间转换工具：能消化源输出、且产出目标能接受的输入 */
function findBridges(ix: CheckerIndex, sourceId: string, targetId: string): ConnectionCheck['bridges'] {
  const srcOut = ix.io[sourceId]?.outputs ?? [];
  const tgtIn = ix.io[targetId]?.inputs ?? [];
  if (!srcOut.length || !tgtIn.length) return undefined;
  const bridges: NonNullable<ConnectionCheck['bridges']> = [];
  for (const [repo, prof] of Object.entries(ix.io)) {
    if (repo === sourceId || repo === targetId) continue;
    if (!prof.inputs.length || !prof.outputs.length) continue;
    const accepts = srcOut.some((o) => prof.inputs.some((i) => canFlow(o, i)));
    const produces = prof.outputs.some((o) => tgtIn.some((i) => canFlow(o, i)));
    if (accepts && produces) {
      const node = ix.nodes.get(repo);
      bridges.push({
        id: repo,
        name: node?.name ?? repo,
        reason: `可接收源输出并产出目标可接受的输入（${prof.outputs.filter((o) => tgtIn.some((i) => canFlow(o, i))).join('、')}）`,
      });
    }
    if (bridges.length >= 3) break;
  }
  return bridges.length ? bridges : undefined;
}

const DIM_UNKNOWN = (label: string, detail: string) => ({ label, state: 'unknown' as const, detail });

/**
 * 对一条 source → target 连线执行五维检查。
 * 返回任务书 §8.1 的五种状态之一 + 具体原因 + 改进建议（§8.3）。
 */
export function checkConnection(ix: CheckerIndex, sourceId: string, targetId: string): ConnectionCheck {
  const srcNode = ix.nodes.get(sourceId);
  const tgtNode = ix.nodes.get(targetId);
  const srcProf = ix.io[sourceId];
  const tgtProf = ix.io[targetId];
  const key = pairKey(sourceId, targetId);
  const rel = ix.official.get(key);
  const cand = ix.candidates.get(key);

  const reasons: string[] = [];
  const suggestions: string[] = [];

  if (!srcNode || !tgtNode) {
    const dim = (label: string) => DIM_UNKNOWN(label, '工具不在目录数据中');
    return {
      status: 'unknown',
      conclusion: '缺少工具资料，无法判断',
      dimensions: {
        taskLogic: dim('任务逻辑'),
        ioCompat: dim('输出/输入'),
        protocol: dim('协议兼容'),
        integration: dim('直接集成'),
        runtime: dim('运行验证'),
      },
      reasons: ['至少一端工具 ID 不在目录节点中（可能来自失效导入）。'],
      suggestions: ['请检查工作流 JSON 中的工具 ID 是否为目录内稳定 ID。'],
    };
  }

  // ---------- 维度 1：任务逻辑（基于已有关系类型） ----------
  const isAlternative = rel?.type === 'alternative' || cand?.type === 'alternative';
  const hasWorkflowRelation =
    (rel && rel.type !== 'alternative') || (cand && cand.type !== 'alternative');

  const taskLogic = isAlternative
    ? {
        label: '任务逻辑',
        state: 'fail' as const,
        detail: '两者是替代关系（功能重叠），不适合顺序连接',
      }
    : hasWorkflowRelation
      ? { label: '任务逻辑', state: 'pass' as const, detail: '存在互补/集成/协议关系，作为工作流前后步骤任务逻辑成立' }
      : {
          label: '任务逻辑',
          state: 'unknown' as const,
          detail: '关系库中没有两者的既有关系，仅能依据输入输出判断',
        };

  // ---------- 维度 2：输入输出 ----------
  const srcOut = srcProf?.outputs ?? [];
  const tgtIn = tgtProf?.inputs ?? [];
  const io = evaluateIo(srcOut, tgtIn);
  const ioCompat =
    io.state === 'match'
      ? { label: '输出/输入', state: 'pass' as const, detail: io.detail }
      : io.state === 'convert'
        ? { label: '输出/输入', state: 'warn' as const, detail: io.detail }
        : io.state === 'conflict'
          ? { label: '输出/输入', state: 'fail' as const, detail: io.detail }
          : { label: '输出/输入', state: 'unknown' as const, detail: io.detail };

  // ---------- 维度 3：协议 ----------
  const srcProto = srcProf?.protocols ?? [];
  const tgtProto = tgtProf?.protocols ?? [];
  const srcIsServer = srcProto.includes('mcp_server');
  const tgtIsClient = tgtProto.includes('mcp_client');
  const bothMcp = [...srcProto, ...tgtProto].some((p) => p.startsWith('mcp'));
  const protocol = srcIsServer && tgtIsClient
    ? {
        label: '协议兼容',
        state: 'pass' as const,
        detail: '源声明 MCP Server、目标声明 MCP Client，协议层具备连接条件',
      }
    : bothMcp
      ? {
          label: '协议兼容',
          state: 'warn' as const,
          detail: '双方涉及 MCP，但角色或兼容性未确认：使用相同协议不等于天然兼容',
        }
      : DIM_UNKNOWN('协议兼容', '没有足够的协议声明资料');

  // ---------- 维度 4：直接集成证据 ----------
  let integration: ConnectionCheck['dimensions']['integration'];
  if (rel) {
    if (rel.evidenceLevel === 'verified') {
      integration = { label: '直接集成', state: 'pass', detail: '存在可复现的实际连接验证' };
    } else if (rel.evidenceLevel === 'documented') {
      integration = { label: '直接集成', state: 'pass', detail: '官方文档明确支持该连接（见关系证据）' };
    } else {
      integration = { label: '直接集成', state: 'warn', detail: `存在推断关系（${rel.type}），尚无直接集成证据` };
    }
  } else if (cand) {
    integration = {
      label: '直接集成',
      state: 'warn',
      detail: `命中候选关系（${cand.type}，${cand.evidenceLevel}），尚未人工审核`,
    };
  } else {
    integration = { label: '直接集成', state: 'unknown', detail: '未发现两者的直接集成证据' };
  }

  // ---------- 维度 5：实际运行验证 ----------
  const runtime =
    rel?.evidenceLevel === 'verified'
      ? { label: '运行验证', state: 'pass' as const, detail: '该关系已通过可复现验证' }
      : DIM_UNKNOWN('运行验证', '未进行实际运行测试（本次不对用户连线做执行）');

  // ---------- 汇总状态 ----------
  let status: CheckStatus;
  let conclusion: string;

  const officialInterfaceEvidence =
    rel && (rel.type === 'integration' || rel.type === 'protocol') &&
    (rel.evidenceLevel === 'verified' || rel.evidenceLevel === 'documented');

  if (isAlternative) {
    status = 'conflict';
    conclusion = '替代关系不应作为工作流前后步骤连接';
  } else if (officialInterfaceEvidence && rel.evidenceLevel === 'verified') {
    status = 'verified';
    conclusion = '已有可复现的连接验证';
  } else if (officialInterfaceEvidence) {
    status = 'documented';
    conclusion = '官方文档支持该连接方式';
  } else if (io.state === 'conflict') {
    status = 'conflict';
    conclusion = '输入输出存在明确冲突';
  } else if (rel || cand || io.state === 'match' || io.state === 'convert') {
    status = 'logical';
    conclusion =
      io.state === 'match' || io.state === 'convert'
        ? '任务逻辑合理，但直接接口兼容性尚未验证'
        : '任务逻辑合理，但实际接口兼容性尚未验证';
  } else {
    status = 'unknown';
    conclusion = '缺少足够资料，无法判断';
  }

  // ---------- 原因与建议（必须具体，不能只返回分数） ----------
  reasons.push(`任务逻辑：${taskLogic.detail}。`);
  reasons.push(`输出/输入：${io.detail}。`);
  reasons.push(`协议兼容：${protocol.detail}。`);
  reasons.push(`直接集成：${integration.detail}。`);
  reasons.push(`运行验证：${runtime.detail}。`);

  if (rel) {
    reasons.push(`公共关系依据：${REL_TYPE_TEXT[rel.type]}——${rel.description}`);
  }
  if (cand && !rel) {
    reasons.push(`候选关系依据（未审核）：${cand.description}${cand.reviewNote ? `（备注：${cand.reviewNote}）` : ''}`);
    suggestions.push('候选关系未经审核，接入前请自行核对官方文档。');
  }

  const bridges = io.state === 'conflict' || (io.state === 'unknown' && srcOut.length && tgtIn.length)
    ? findBridges(ix, sourceId, targetId)
    : undefined;

  if (io.state === 'convert') {
    suggestions.push('建议先增加一步格式转换（如 Markdown ↔ HTML ↔ 纯文本）再接入。');
  }
  if (io.state === 'conflict') {
    if (bridges?.length) {
      suggestions.push(`推荐中间转换工具：${bridges.map((b) => b.name).join('、')}。`);
    } else {
      suggestions.push('未找到现成的中间转换工具，建议增加自定义转换步骤或更换目标工具。');
    }
  }
  if (protocol.state === 'warn') {
    suggestions.push('双方都涉及 MCP 不等于可以直连，请确认客户端/服务端角色与传输方式后再接入。');
  }
  for (const c of [srcProf, tgtProf]) {
    for (const k of c?.constraints ?? []) {
      const label = CONSTRAINT_TEXT[k] ?? k;
      if (!suggestions.includes(label)) suggestions.push(label);
    }
  }
  if (status === 'unknown') {
    suggestions.push('资料不足：可先小规模试连并把结果补进关系库，再依赖该结论。');
  }
  if (status === 'logical' && rel?.evidenceLevel === 'inferred') {
    suggestions.push('当前依据为推断关系，建议按官方 README 核实接口后再采信。');
  }

  return {
    status,
    conclusion,
    dimensions: { taskLogic, ioCompat, protocol, integration, runtime },
    reasons,
    suggestions: [...new Set(suggestions)],
    relation: rel
      ? { id: rel.id, type: rel.type, evidenceLevel: rel.evidenceLevel, description: rel.description, source: rel.source, target: rel.target }
      : undefined,
    candidate: cand
      ? { id: cand.id, type: cand.type, evidenceLevel: cand.evidenceLevel, description: cand.description, reviewNote: cand.reviewNote }
      : undefined,
    ioEvidence:
      srcProf || tgtProf
        ? {
            sourceOutputs: srcOut,
            targetInputs: tgtIn,
            sourceLevel: srcProf?.evidenceLevel ?? 'unknown',
            targetLevel: tgtProf?.evidenceLevel ?? 'unknown',
          }
        : undefined,
    bridges,
  };
}

export const REL_TYPE_TEXT: Record<string, string> = {
  integration: '集成关系',
  protocol: '协议兼容',
  complementary: '工作流互补',
  alternative: '功能替代',
};

export const CONSTRAINT_TEXT: Record<string, string> = {
  requires_api_key: '额外要求：需要配置 API Key / 认证凭据。',
  requires_self_host: '额外要求：需要自行部署（Docker/本地服务）。',
  requires_cloud_account: '额外要求：需要注册云服务账号。',
  requires_browser: '额外要求：需要本机浏览器环境。',
  requires_gpu: '额外要求：需要 GPU 资源。',
};
