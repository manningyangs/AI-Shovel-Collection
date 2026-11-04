// 工作流搭建器（任务书 §七 / §十二）：左侧工具选择 + 中间画布 + 右侧属性与检查面板。
// - 自由拖动/连线/删除/撤销重做/整理布局/适应画布
// - localStorage 自动保存（刷新不丢失）；JSON 导入导出（导入只做结构校验，绝不执行其中内容）
// - 每条连线创建即运行 connectionChecker 五维检查，展示具体原因与改进建议
// - 典型工作流模板载入（模板数据已过 build_tool_map.py 工具 ID 校验）
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BaseEdge,
  Background,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  getBezierPath,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './tool-map.css';
import {
  CHECK_STYLE,
  EVIDENCE_LABEL,
  capColor,
  type CheckStatus,
  type ConnectionCheck,
  type IOProfile,
  type MapData,
  type MapNodeData,
  type WorkflowTemplate,
} from './types';
import {
  CONSTRAINT_TEXT,
  buildCheckerIndex,
  checkConnection,
  type CheckerIndex,
} from './connectionChecker';

const LS_KEY = 'ai-shovel-tool-workflow-v1';
const MAX_NODES = 80;
const MAX_EDGES = 300;

type WfNodeData = { tool: MapNodeData; capIndex: number };
type WfEdgeData = { check: ConnectionCheck };
type Snapshot = { nodes: Node[]; edges: Edge[] };
type Selection = { kind: 'node' | 'edge'; id: string } | null;

const nodeTypes = { wf: WorkflowNode };
const edgeTypes = { wf: WorkflowEdge };

const DASH_BY_STATUS: Record<CheckStatus, string | undefined> = {
  verified: undefined,
  documented: undefined,
  logical: '7 5',
  conflict: undefined,
  unknown: '4 4',
};

/* ================= 自定义节点 ================= */
function WorkflowNode({ data, selected }: { data: unknown; selected?: boolean }) {
  const d = data as WfNodeData;
  const { tool, capIndex } = d;
  const color = capColor(capIndex);
  return (
    <div
      className={`wf-node ${selected ? 'is-selected' : ''}`}
      style={{ ['--node-color' as string]: color }}
      title={`${tool.id}\n${tool.desc || ''}`}
    >
      <Handle type="target" position={Position.Left} className="wf-handle wf-handle-in" />
      <div className="wf-node-name">{tool.name}</div>
      <div className="wf-node-cat">{tool.category.split('、')[0]}</div>
      <Handle type="source" position={Position.Right} className="wf-handle wf-handle-out" />
    </div>
  );
}

/* ================= 自定义连线（检查状态徽标常显） ================= */
function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}: EdgeProps) {
  const check = (data as unknown as WfEdgeData).check;
  const st = CHECK_STYLE[check.status];
  const [path, lx, ly] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.25,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: st.color,
          strokeWidth: selected ? 3 : 2,
          strokeDasharray: DASH_BY_STATUS[check.status],
        }}
        interactionWidth={18}
      />
      <EdgeLabelRenderer>
        <div
          className={`wf-edge-badge st-${check.status}`}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          title={`${st.label}：${check.conclusion}`}
        >
          <span className="wf-edge-sym" aria-hidden="true">{st.symbol}</span>
          {st.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

/* ================= 导入校验（只读结构，绝不执行导入内容） ================= */
type ValidateResult =
  | { ok: false; error: string }
  | { ok: true; name?: string; nodes: Node[]; edges: Edge[] };

function validateWorkflowJson(
  parsed: unknown,
  ix: CheckerIndex,
  capIndexMap: Record<string, number>,
): ValidateResult {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: '根节点必须是对象' };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.schema !== undefined && obj.schema !== 'ai-shovel-tool-workflow') {
    return { ok: false, error: `schema 不受支持（${String(obj.schema)}）` };
  }
  const rawNodes = obj.nodes;
  if (!Array.isArray(rawNodes)) return { ok: false, error: '缺少 nodes 数组' };
  if (rawNodes.length > MAX_NODES) return { ok: false, error: `节点数超过上限 ${MAX_NODES}` };

  const nodes: Node[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rawNodes.length; i++) {
    const n = rawNodes[i];
    if (typeof n !== 'object' || n === null) return { ok: false, error: `nodes[${i}] 不是对象` };
    const id = (n as { id?: unknown }).id;
    if (typeof id !== 'string') return { ok: false, error: `nodes[${i}].id 缺失或不是字符串` };
    if (!ix.nodes.has(id)) return { ok: false, error: `nodes[${i}] 工具 ID 不在目录中：${id}` };
    if (seen.has(id)) return { ok: false, error: `节点重复：${id}` };
    seen.add(id);
    const pos = (n as { position?: unknown }).position;
    let position = { x: 140 + (i % 3) * 300, y: 90 + Math.floor(i / 3) * 170 };
    if (pos !== undefined) {
      if (typeof pos !== 'object' || pos === null) return { ok: false, error: `nodes[${i}].position 非法` };
      const { x, y } = pos as { x?: unknown; y?: unknown };
      if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
        return { ok: false, error: `nodes[${i}].position 必须是有限数字 {x,y}` };
      }
      position = { x, y };
    }
    const tool = ix.nodes.get(id)!;
    nodes.push({
      id,
      type: 'wf',
      position,
      data: { tool, capIndex: capIndexMap[tool.capability] ?? 0 } satisfies WfNodeData,
    });
  }

  const rawEdges = obj.edges === undefined ? [] : obj.edges;
  if (!Array.isArray(rawEdges)) return { ok: false, error: 'edges 必须是数组' };
  if (rawEdges.length > MAX_EDGES) return { ok: false, error: `连线数超过上限 ${MAX_EDGES}` };

  const edges: Edge[] = [];
  const pairs = new Set<string>();
  for (let i = 0; i < rawEdges.length; i++) {
    const e = rawEdges[i];
    if (typeof e !== 'object' || e === null) return { ok: false, error: `edges[${i}] 不是对象` };
    const { source, target } = e as { source?: unknown; target?: unknown };
    if (typeof source !== 'string' || typeof target !== 'string') {
      return { ok: false, error: `edges[${i}] 缺少 source/target 字符串` };
    }
    if (!seen.has(source)) return { ok: false, error: `edges[${i}] source 不在节点列表：${source}` };
    if (!seen.has(target)) return { ok: false, error: `edges[${i}] target 不在节点列表：${target}` };
    if (source === target) return { ok: false, error: `edges[${i}] 不允许自环` };
    const pk = [source.toLowerCase(), target.toLowerCase()].sort().join('::');
    if (pairs.has(pk)) continue; // 重复连线去重
    pairs.add(pk);
    const check = checkConnection(ix, source, target);
    edges.push({
      id: `wf-${source}--${target}`,
      source,
      target,
      type: 'wf',
      data: { check } satisfies WfEdgeData,
      markerEnd: { type: 'arrowclosed', width: 16, height: 16, color: CHECK_STYLE[check.status].color },
    });
  }

  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 60) : undefined;
  return { ok: true, name, nodes, edges };
}

/* ================= 主组件 ================= */
export default function WorkflowBuilder({
  data,
  onExit,
  initialTemplateId,
  onTemplateConsumed,
}: {
  data: MapData;
  onExit: () => void;
  initialTemplateId?: string | null;
  onTemplateConsumed?: () => void;
}) {
  const ix = useMemo(() => buildCheckerIndex(data), [data]);
  const capIndexMap = useMemo(() => {
    const m: Record<string, number> = {};
    data.capabilities.forEach((c, i) => (m[c.id] = i));
    return m;
  }, [data]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [sel, setSel] = useState<Selection>(null);
  const [wfName, setWfName] = useState('我的工作流');
  const [query, setQuery] = useState('');
  const [capFilter, setCapFilter] = useState('all');
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [bootDone, setBootDone] = useState(false);
  const [, setTick] = useState(0);

  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const histQueuedRef = useRef(false);
  const instanceRef = useRef<ReactFlowInstance | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 4200);
  }, []);

  /* ---------- 历史（撤销/重做） ---------- */
  const pushHistory = useCallback(() => {
    pastRef.current.push({ nodes, edges });
    if (pastRef.current.length > 60) pastRef.current.shift();
    futureRef.current = [];
    setTick((t) => t + 1);
  }, [nodes, edges]);

  /** 同一批变更（删除节点连带删除边）只入栈一次 */
  const pushHistoryOnce = useCallback(() => {
    if (histQueuedRef.current) return;
    histQueuedRef.current = true;
    pushHistory();
    window.setTimeout(() => {
      histQueuedRef.current = false;
    }, 0);
  }, [pushHistory]);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push({ nodes, edges });
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setSel(null);
    setTick((t) => t + 1);
  }, [nodes, edges, setNodes, setEdges]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push({ nodes, edges });
    setNodes(next.nodes);
    setEdges(next.edges);
    setSel(null);
    setTick((t) => t + 1);
  }, [nodes, edges, setNodes, setEdges]);

  /* ---------- 变更拦截（删除入历史 / 拖动入历史） ---------- */
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      if (changes.some((c) => c.type === 'remove')) pushHistoryOnce();
      onNodesChange(changes);
    },
    [onNodesChange, pushHistoryOnce],
  );
  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      if (changes.some((c) => c.type === 'remove')) pushHistoryOnce();
      onEdgesChange(changes);
    },
    [onEdgesChange, pushHistoryOnce],
  );

  /* ---------- 首次挂载：读取本地保存（结构校验，无效则忽略） ---------- */
  useEffect(() => {
    const boot = () => {
      try {
        const raw = window.localStorage.getItem(LS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          const res = validateWorkflowJson(parsed, ix, capIndexMap);
          if (res.ok) {
            setNodes(res.nodes);
            setEdges(res.edges);
            if (res.name) setWfName(res.name);
            setSavedAt('已恢复本地保存');
          } else {
            showToast(`本地保存的工作流无效（${res.error}），已忽略`);
          }
        }
      } catch {
        showToast('本地保存的工作流无法解析，已忽略');
      }
      setBootDone(true);
      window.setTimeout(() => instanceRef.current?.fitView({ padding: 0.2, duration: 200 }), 80);
    };
    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- 自动保存（刷新不丢失） ---------- */
  useEffect(() => {
    if (!bootDone) return;
    const t = window.setTimeout(() => {
      const payload = {
        schema: 'ai-shovel-tool-workflow',
        version: 1,
        name: wfName,
        savedAt: new Date().toISOString(),
        nodes: nodes.map((n) => ({ id: n.id, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
        edges: edges.map((e) => ({ source: e.source, target: e.target })),
      };
      try {
        window.localStorage.setItem(LS_KEY, JSON.stringify(payload));
        setSavedAt(`已自动保存 ${new Date().toLocaleTimeString()}`);
      } catch {
        setSavedAt('自动保存失败（存储空间不足）');
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [nodes, edges, wfName, bootDone]);

  /* ---------- 撤销/重做快捷键 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  /* ---------- 模板载入 ---------- */
  const templates: WorkflowTemplate[] = data.templates ?? [];

  const loadTemplate = useCallback(
    (tpl: WorkflowTemplate) => {
      const ns: Node[] = [];
      const es: Edge[] = [];
      for (let i = 0; i < tpl.steps.length; i++) {
        const step = tpl.steps[i];
        const tool = ix.nodes.get(step.tool);
        if (!tool) continue;
        ns.push({
          id: tool.id,
          type: 'wf',
          position: { x: 90 + (i % 4) * 300, y: 150 + Math.floor(i / 4) * 190 },
          data: { tool, capIndex: capIndexMap[tool.capability] ?? 0 } satisfies WfNodeData,
        });
      }
      for (let i = 1; i < tpl.steps.length; i++) {
        const source = tpl.steps[i - 1].tool;
        const target = tpl.steps[i].tool;
        if (!ix.nodes.has(source) || !ix.nodes.has(target)) continue;
        const check = checkConnection(ix, source, target);
        es.push({
          id: `wf-${source}--${target}`,
          source,
          target,
          type: 'wf',
          data: { check } satisfies WfEdgeData,
          markerEnd: { type: 'arrowclosed', width: 16, height: 16, color: CHECK_STYLE[check.status].color },
        });
      }
      pushHistory();
      setNodes(ns);
      setEdges(es);
      setWfName(tpl.title);
      setSel(null);
      showToast(`已载入模板「${tpl.title}」（${ns.length} 个工具 / ${es.length} 条连线），每条连线的检查结果可点击查看`);
      window.setTimeout(() => instanceRef.current?.fitView({ padding: 0.2, duration: 250 }), 60);
    },
    [ix, capIndexMap, pushHistory, setNodes, setEdges, showToast],
  );

  useEffect(() => {
    if (!initialTemplateId) return;
    const tpl = templates.find((t) => t.id === initialTemplateId);
    if (tpl) loadTemplate(tpl);
    onTemplateConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId]);

  /* ---------- 节点操作 ---------- */
  const addTool = useCallback(
    (tool: MapNodeData) => {
      if (nodes.some((n) => n.id === tool.id)) {
        showToast('该工具已在画布中');
        return;
      }
      if (nodes.length >= MAX_NODES) {
        showToast(`节点数已达上限 ${MAX_NODES}`);
        return;
      }
      pushHistory();
      const i = nodes.length;
      setNodes((ns) => [
        ...ns,
        {
          id: tool.id,
          type: 'wf',
          position: { x: 130 + (i % 3) * 300, y: 90 + Math.floor(i / 3) * 170 },
          data: { tool, capIndex: capIndexMap[tool.capability] ?? 0 } satisfies WfNodeData,
          selected: false,
        },
      ]);
      setSel({ kind: 'node', id: tool.id });
      if (window.matchMedia('(max-width: 768px)').matches) setLeftOpen(false);
    },
    [nodes, capIndexMap, pushHistory, setNodes, showToast],
  );

  const removeNode = useCallback(
    (id: string) => {
      pushHistory();
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSel((s) => (s?.kind === 'node' && s.id === id ? null : s));
    },
    [pushHistory, setNodes, setEdges],
  );

  /* ---------- 连线 ---------- */
  const makeEdge = useCallback(
    (source: string, target: string): Edge => {
      const check = checkConnection(ix, source, target);
      return {
        id: `wf-${source}--${target}`,
        source,
        target,
        type: 'wf',
        data: { check } satisfies WfEdgeData,
        markerEnd: { type: 'arrowclosed', width: 16, height: 16, color: CHECK_STYLE[check.status].color },
      };
    },
    [ix],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target) return;
      if (c.source === c.target) {
        showToast('不能把工具连接到它自己');
        return;
      }
      if (edges.some((e) => e.source === c.source && e.target === c.target)) {
        showToast('这两个工具之间已存在同向连线');
        return;
      }
      pushHistory();
      const edge = makeEdge(c.source, c.target);
      setEdges((eds) => addEdge(edge, eds));
      setSel({ kind: 'edge', id: edge.id });
      setRightOpen(true);
      const st = CHECK_STYLE[(edge.data as unknown as WfEdgeData).check.status];
      showToast(`连接检查：${st.label} —— ${(edge.data as unknown as WfEdgeData).check.conclusion}`);
    },
    [edges, pushHistory, makeEdge, setEdges, showToast],
  );

  /** 连线方向调整（拖拽端点改接） */
  const onReconnect = useCallback(
    (oldEdge: Edge, conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      pushHistory();
      const fresh = makeEdge(conn.source, conn.target);
      setEdges((eds) => eds.map((e) => (e.id === oldEdge.id ? { ...fresh, id: oldEdge.id } : e)));
      setSel({ kind: 'edge', id: oldEdge.id });
    },
    [pushHistory, makeEdge, setEdges],
  );

  const recheckEdge = useCallback(
    (id: string) => {
      pushHistory();
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== id) return e;
          const check = checkConnection(ix, e.source, e.target);
          return {
            ...e,
            data: { check } satisfies WfEdgeData,
            markerEnd: { type: 'arrowclosed', width: 16, height: 16, color: CHECK_STYLE[check.status].color },
          };
        }),
      );
      showToast('已按当前关系数据重新检查该连线');
    },
    [pushHistory, setEdges, ix, showToast],
  );

  const recheckAll = useCallback(() => {
    if (!edges.length) return;
    pushHistory();
    setEdges((eds) =>
      eds.map((e) => {
        const check = checkConnection(ix, e.source, e.target);
        return {
          ...e,
          data: { check } satisfies WfEdgeData,
          markerEnd: { type: 'arrowclosed', width: 16, height: 16, color: CHECK_STYLE[check.status].color },
        };
      }),
    );
    showToast('已重新检查全部连线');
  }, [edges.length, pushHistory, setEdges, ix, showToast]);

  /* ---------- 保存 / 导入 / 导出 / 清空 ---------- */
  const saveNow = useCallback(() => {
    const payload = {
      schema: 'ai-shovel-tool-workflow',
      version: 1,
      name: wfName,
      savedAt: new Date().toISOString(),
      nodes: nodes.map((n) => ({ id: n.id, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
      edges: edges.map((e) => ({ source: e.source, target: e.target })),
    };
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(payload));
      setSavedAt(`已手动保存 ${new Date().toLocaleTimeString()}`);
      showToast('工作流已保存到浏览器本地');
    } catch {
      showToast('保存失败：浏览器存储不可用');
    }
  }, [nodes, edges, wfName, showToast]);

  const exportJson = useCallback(() => {
    const payload = {
      schema: 'ai-shovel-tool-workflow',
      version: 1,
      name: wfName,
      exportedAt: new Date().toISOString(),
      generator: 'AI-Shovel-Collection / tool-map',
      nodes: nodes.map((n) => ({ id: n.id, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
      edges: edges.map((e) => ({ source: e.source, target: e.target })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${(wfName || 'untitled').replace(/\s+/g, '-').slice(0, 40)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出工作流 JSON（不含任何可执行代码）');
  }, [nodes, edges, wfName, showToast]);

  const importFile = useCallback(
    async (file: File) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        showToast('导入失败：不是合法 JSON 文件');
        return;
      }
      const res = validateWorkflowJson(parsed, ix, capIndexMap);
      if (!res.ok) {
        showToast(`导入失败：${res.error}`);
        return;
      }
      pushHistory();
      setNodes(res.nodes);
      setEdges(res.edges);
      if (res.name) setWfName(res.name);
      setSel(null);
      showToast(`已导入 ${res.nodes.length} 个节点 / ${res.edges.length} 条连线，并完成连接检查`);
      window.setTimeout(() => instanceRef.current?.fitView({ padding: 0.2, duration: 250 }), 60);
    },
    [ix, pushHistory, setNodes, setEdges, showToast],
  );

  const clearAll = useCallback(() => {
    if (nodes.length === 0 && edges.length === 0) return;
    pushHistory();
    setNodes([]);
    setEdges([]);
    setSel(null);
    showToast('已清空工作区（可撤销）');
  }, [nodes.length, edges.length, pushHistory, setNodes, setEdges, showToast]);

  const autoLayout = useCallback(() => {
    if (!nodes.length) return;
    pushHistory();
    setNodes((ns) =>
      ns.map((n, i) => ({
        ...n,
        position: { x: 90 + (i % 4) * 300, y: 150 + Math.floor(i / 4) * 190 },
      })),
    );
    window.setTimeout(() => instanceRef.current?.fitView({ padding: 0.2, duration: 300 }), 40);
  }, [nodes.length, pushHistory, setNodes]);

  const fitView = useCallback(() => {
    instanceRef.current?.fitView({ padding: 0.2, duration: 300 });
  }, []);

  /* ---------- 左侧工具列表 ---------- */
  const inCanvas = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.nodes.filter((n) => {
      if (capFilter !== 'all' && n.capability !== capFilter) return false;
      if (q) {
        const hay = `${n.name} ${n.id} ${n.category} ${n.desc || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.nodes, query, capFilter]);

  /* ---------- 选中对象 ---------- */
  const selNode = sel?.kind === 'node' ? (nodes.find((n) => n.id === sel.id) ?? null) : null;
  const selEdge = sel?.kind === 'edge' ? (edges.find((e) => e.id === sel.id) ?? null) : null;
  const selTool = selNode ? (selNode.data as unknown as WfNodeData).tool : null;
  const selCheck = selEdge ? (selEdge.data as unknown as WfEdgeData).check : null;
  const selPairRel = selEdge ? ix.official.get(pairKeyOf(selEdge.source, selEdge.target)) : null;

  const statusTally = useMemo(() => {
    const m: Record<CheckStatus, number> = { verified: 0, documented: 0, logical: 0, conflict: 0, unknown: 0 };
    edges.forEach((e) => {
      const c = (e.data as unknown as WfEdgeData)?.check;
      if (c) m[c.status] += 1;
    });
    return m;
  }, [edges]);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  /* ---------- 左侧面板 ---------- */
  const leftPanel = (
    <div className="tm-left-inner">
      <input
        type="search"
        className="tm-search wf-search"
        placeholder="搜索工具名称 / 仓库 / 描述…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="搜索工具"
      />
      <div className="tm-group">
        <div className="tm-group-title">能力领域</div>
        <select className="tm-select" value={capFilter} onChange={(e) => setCapFilter(e.target.value)}>
          <option value="all">全部领域（{data.nodes.length}）</option>
          {data.capabilities.map((c) => {
            const cnt = data.nodes.filter((n) => n.capability === c.id).length;
            if (!cnt) return null;
            return (
              <option key={c.id} value={c.id}>
                {c.name}（{cnt}）
              </option>
            );
          })}
        </select>
      </div>

      {templates.length > 0 && (
        <div className="tm-group">
          <div className="tm-group-title">典型工作流模板</div>
          {templates.map((t) => (
            <button
              key={t.id}
              className="wf-tpl-btn"
              onClick={() => {
                if (nodes.length > 0 && !window.confirm('载入模板会替换当前画布内容（可撤销），继续？')) return;
                loadTemplate(t);
              }}
            >
              <span className="wf-tpl-title">{t.title}</span>
              <span className="tm-count">{t.steps.length} 步</span>
            </button>
          ))}
          <p className="wf-tpl-note">模板仅基于公开能力编排，连线检查结果请以画布上的实际检查为准。</p>
        </div>
      )}

      <div className="tm-group">
        <div className="tm-group-title">
          工具列表
          <span className="tm-count">{filteredTools.length}</span>
        </div>
        <div className="wf-tool-list">
          {filteredTools.length === 0 && <p className="tm-muted">没有匹配的工具。</p>}
          {filteredTools.map((t) => (
            <div key={t.id} className="wf-tool-row" title={t.desc || t.id}>
              <span className="wf-tool-name">{t.name}</span>
              <span className="wf-tool-cat">{t.category.split('、')[0]}</span>
              <button
                className={`wf-add-btn ${inCanvas.has(t.id) ? 'added' : ''}`}
                onClick={() => addTool(t)}
                disabled={inCanvas.has(t.id)}
                aria-label={inCanvas.has(t.id) ? '已在画布' : `添加 ${t.name}`}
              >
                {inCanvas.has(t.id) ? '✓' : '+'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  /* ---------- 右侧面板 ---------- */
  let rightPanel: React.ReactNode;
  if (selTool) {
    const prof: IOProfile | undefined = ix.io[selTool.id];
    rightPanel = (
      <div className="tm-detail-inner">
        <div className="tm-detail-head">
          <h3 title={selTool.name}>{selTool.name}</h3>
          <button className="tm-icon-btn" onClick={() => setSel(null)} aria-label="关闭">×</button>
        </div>
        <div className="tm-detail-repo" title={selTool.id}>
          <a href={`https://github.com/${selTool.id}`} target="_blank" rel="noopener">{selTool.id} ↗</a>
        </div>
        <dl className="tm-kv">
          <dt>分类</dt><dd>{selTool.category}</dd>
          {selTool.lang && (<><dt>语言</dt><dd>{selTool.lang}</dd></>)}
          {typeof selTool.stars === 'number' && selTool.stars > 0 && (<><dt>Stars</dt><dd>★ {selTool.stars.toLocaleString()}</dd></>)}
        </dl>

        <div className="tm-sub-title">能力画像</div>
        {prof ? (
          <>
            <div className="wf-io-row">
              <span className="wf-io-label">输入</span>
              <span className="wf-chips">
                {prof.inputs.length
                  ? prof.inputs.map((x) => <i key={x} className="wf-io-chip in">{x}</i>)
                  : <i className="wf-io-chip unknown">未知</i>}
              </span>
            </div>
            <div className="wf-io-row">
              <span className="wf-io-label">输出</span>
              <span className="wf-chips">
                {prof.outputs.length
                  ? prof.outputs.map((x) => <i key={x} className="wf-io-chip out">{x}</i>)
                  : <i className="wf-io-chip unknown">未知</i>}
              </span>
            </div>
            {prof.protocols.length > 0 && (
              <div className="wf-io-row">
                <span className="wf-io-label">协议</span>
                <span className="wf-chips">{prof.protocols.map((x) => <i key={x} className="wf-io-chip proto">{x}</i>)}</span>
              </div>
            )}
            {prof.operations.length > 0 && (
              <div className="wf-io-row">
                <span className="wf-io-label">操作</span>
                <span className="wf-chips">{prof.operations.map((x) => <i key={x} className="wf-io-chip op">{x}</i>)}</span>
              </div>
            )}
            {prof.constraints.length > 0 && (
              <div className="wf-io-row">
                <span className="wf-io-label">约束</span>
                <span className="wf-chips">{prof.constraints.map((x) => <i key={x} className="wf-io-chip warn">{CONSTRAINT_TEXT[x] ?? x}</i>)}</span>
              </div>
            )}
            <div className="wf-io-ev">
              <span className={`tm-badge ev-${prof.evidenceLevel}`}>
                {EVIDENCE_LABEL[(prof.evidenceLevel as keyof typeof EVIDENCE_LABEL)] ?? prof.evidenceLevel}
              </span>
              <span className="tm-muted" style={{ marginLeft: 6 }}>
                {prof.explicitInputs?.length || prof.explicitOutputs?.length ? '含文档显式证据' : '主要来自操作规则派生'}
              </span>
              {prof.evidence?.map((ev, i) => (
                <a key={i} className="wf-ev-link" href={ev.url} target="_blank" rel="noopener">{ev.type} ↗</a>
              ))}
            </div>
          </>
        ) : (
          <p className="tm-muted">该工具没有能力画像，连线检查将按信息不足处理。</p>
        )}

        <div className="wf-actions">
          <button className="tm-btn ghost" onClick={() => setSel(null)}>取消选择</button>
          <button className="tm-btn ghost" onClick={() => removeNode(selTool.id)}>从画布移除</button>
        </div>
      </div>
    );
  } else if (selEdge && selCheck) {
    const check = selCheck;
    const st = CHECK_STYLE[check.status];
    rightPanel = (
      <div className="tm-detail-inner">
        <div className="tm-detail-head">
          <h3>连线检查</h3>
          <button className="tm-icon-btn" onClick={() => setSel(null)} aria-label="关闭">×</button>
        </div>
        <div className="wf-edge-ends">
          <button onClick={() => setSel({ kind: 'node', id: selEdge.source })} title={selEdge.source}>
            {ix.nodes.get(selEdge.source)?.name || selEdge.source}
          </button>
          <span aria-hidden="true">→</span>
          <button onClick={() => setSel({ kind: 'node', id: selEdge.target })} title={selEdge.target}>
            {ix.nodes.get(selEdge.target)?.name || selEdge.target}
          </button>
        </div>

        <div className="wf-status-card" style={{ borderColor: st.color }}>
          <span className="wf-status-sym" style={{ background: st.color }}>{st.symbol}</span>
          <div>
            <b style={{ color: st.color }}>{st.label}</b>
            <p>{check.conclusion}</p>
          </div>
        </div>

        <div className="tm-sub-title">分维度结果（任务逻辑 / 接口 / 运行验证不混为一谈）</div>
        <ul className="wf-dims">
          {Object.values(check.dimensions).map((d) => (
            <li key={d.label} className={`dim-${d.state}`}>
              <span className="wf-dim-icon" aria-hidden="true">
                {d.state === 'pass' ? '✓' : d.state === 'warn' ? '!' : d.state === 'fail' ? '×' : '?'}
              </span>
              <span className="wf-dim-label">{d.label}</span>
              <span className="wf-dim-detail">{d.detail}</span>
            </li>
          ))}
        </ul>

        <div className="tm-sub-title">检查依据</div>
        <ul className="wf-reasons">
          {check.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>

        {check.ioEvidence && (check.ioEvidence.sourceOutputs.length > 0 || check.ioEvidence.targetInputs.length > 0) && (
          <>
            <div className="tm-sub-title">画像证据</div>
            <div className="wf-io-row">
              <span className="wf-io-label">源输出</span>
              <span className="wf-chips">
                {check.ioEvidence.sourceOutputs.length
                  ? check.ioEvidence.sourceOutputs.map((x) => <i key={x} className="wf-io-chip out">{x}</i>)
                  : <i className="wf-io-chip unknown">未知</i>}
              </span>
            </div>
            <div className="wf-io-row">
              <span className="wf-io-label">目标输入</span>
              <span className="wf-chips">
                {check.ioEvidence.targetInputs.length
                  ? check.ioEvidence.targetInputs.map((x) => <i key={x} className="wf-io-chip in">{x}</i>)
                  : <i className="wf-io-chip unknown">未知</i>}
              </span>
            </div>
          </>
        )}

        {check.bridges && check.bridges.length > 0 && (
          <>
            <div className="tm-sub-title">推荐中间转换工具</div>
            {check.bridges.map((b) => (
              <div key={b.id} className="wf-bridge-row">
                <span className="wf-bridge-name" title={b.reason}>{b.name}</span>
                <span className="tm-muted">{b.reason}</span>
                <button
                  className="wf-add-btn"
                  onClick={() => addTool(ix.nodes.get(b.id)!)}
                  disabled={inCanvas.has(b.id)}
                  aria-label={`添加 ${b.name}`}
                >{inCanvas.has(b.id) ? '✓' : '+'}</button>
              </div>
            ))}
          </>
        )}

        <div className="tm-sub-title">改进建议</div>
        <ul className="wf-sugg">
          {check.suggestions.length ? check.suggestions.map((s, i) => <li key={i}>{s}</li>) : <li className="tm-muted">暂无额外建议。</li>}
        </ul>

        {selPairRel && selPairRel.evidence && selPairRel.evidence.length > 0 && (
          <>
            <div className="tm-sub-title">关系证据</div>
            <ul className="wf-reasons">
              {selPairRel.evidence.map((ev, i) => (
                <li key={i}><a href={ev.url} target="_blank" rel="noopener">{ev.url}</a></li>
              ))}
            </ul>
          </>
        )}

        <div className="wf-actions">
          <button className="tm-btn ghost" onClick={() => recheckEdge(selEdge.id)}>重新检查</button>
          <button
            className="tm-btn ghost"
            onClick={() => {
              pushHistory();
              setEdges((eds) => eds.filter((e) => e.id !== selEdge.id));
              setSel(null);
              showToast('已删除连线（可撤销）');
            }}
          >删除连线</button>
        </div>
      </div>
    );
  } else {
    rightPanel = (
      <div className="tm-detail-inner">
        <div className="tm-sub-title">工作流概况</div>
        <div className="tm-mini-stats">
          <div><b>{nodes.length}</b><span>工具节点</span></div>
          <div><b>{edges.length}</b><span>连线</span></div>
          <div><b>{statusTally.conflict}</b><span>存在冲突</span></div>
          <div><b>{statusTally.unknown}</b><span>信息不足</span></div>
        </div>

        <div className="tm-sub-title">
          连线检查汇总
          {edges.length > 0 && (
            <button className="tm-link-btn" onClick={recheckAll}>全部重新检查</button>
          )}
        </div>
        {edges.length === 0 ? (
          <p className="tm-muted">还没有连线。从左侧把工具加入画布，再从节点一侧锚点拖到另一节点即可创建连接，系统会立即检查合理性。</p>
        ) : (
          edges.map((e) => {
            const c = (e.data as unknown as WfEdgeData)?.check;
            if (!c) return null;
            const st = CHECK_STYLE[c.status];
            return (
              <button key={e.id} className="wf-sum-row" onClick={() => { setSel({ kind: 'edge', id: e.id }); setRightOpen(true); }}>
                <span className="wf-sum-chip" style={{ background: st.color }}>{st.symbol}</span>
                <span className="wf-sum-path">
                  {ix.nodes.get(e.source)?.name || e.source} → {ix.nodes.get(e.target)?.name || e.target}
                </span>
                <span className="tm-count">{st.label}</span>
              </button>
            );
          })
        )}

        <div className="tm-sub-title">检查状态说明</div>
        <ul className="wf-status-legend">
          {(Object.keys(CHECK_STYLE) as CheckStatus[]).map((k) => (
            <li key={k}>
              <span className="wf-sum-chip" style={{ background: CHECK_STYLE[k].color }}>{CHECK_STYLE[k].symbol}</span>
              <b>{CHECK_STYLE[k].label}</b>
              <span className="tm-muted">
                {k === 'verified' && '已有可复现验证'}
                {k === 'documented' && '官方文档支持'}
                {k === 'logical' && '任务逻辑合理，接口未验证'}
                {k === 'conflict' && '输入输出或步骤存在明确冲突'}
                {k === 'unknown' && '资料不足，无法判断'}
              </span>
            </li>
          ))}
        </ul>
        <p className="wf-tpl-note">检查为浏览器端规则计算，不会执行任何工具代码；用户连线只保存在本机浏览器，不会写入公共关系库。</p>
      </div>
    );
  }

  /* ---------- 渲染 ---------- */
  return (
    <div className={`tm-app wf-app ${leftOpen ? 'left-open' : ''} ${rightOpen ? 'right-open' : ''}`}>
      <div className="tm-toolbar wf-toolbar">
        <button className="tm-btn ghost" onClick={onExit} title="返回关系探索模式">← 关系探索</button>
        <button
          type="button"
          className="tm-icon-btn drawer-toggle"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setLeftOpen((v) => !v)}
          aria-label="打开工具选择"
        >☰</button>
        <input
          className="wf-name-input"
          value={wfName}
          onChange={(e) => setWfName(e.target.value)}
          maxLength={60}
          aria-label="工作流名称"
          title="工作流名称"
        />
        <button className="tm-btn ghost" onClick={undo} disabled={!canUndo} title="撤销 (Ctrl+Z)">↶ 撤销</button>
        <button className="tm-btn ghost" onClick={redo} disabled={!canRedo} title="重做 (Ctrl+Shift+Z)">↷ 重做</button>
        <button className="tm-btn ghost" onClick={autoLayout} disabled={!nodes.length} title="整理布局">整理布局</button>
        <button className="tm-btn ghost" onClick={fitView} disabled={!nodes.length} title="适应画布">适应画布</button>
        <button className="tm-btn ghost" onClick={() => fileRef.current?.click()} title="导入工作流 JSON">导入</button>
        <button className="tm-btn ghost" onClick={exportJson} disabled={!nodes.length} title="导出工作流 JSON">导出</button>
        <button className="tm-btn ghost" onClick={saveNow} title="保存到浏览器本地">保存</button>
        <button className="tm-btn ghost" onClick={clearAll} disabled={!nodes.length} title="清空工作区">清空</button>
        <button
          type="button"
          className="tm-icon-btn drawer-toggle"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setRightOpen((v) => !v)}
          aria-label="打开检查面板"
        >ⓘ</button>
        <span className="tm-tally" aria-live="polite">
          {nodes.length} 节点 · {edges.length} 连线
          {statusTally.conflict > 0 && <b className="wf-tally-bad"> · {statusTally.conflict} 冲突</b>}
          {savedAt && <em className="wf-saved"> {savedAt}</em>}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
            e.target.value = '';
          }}
        />
      </div>

      <aside className={`tm-left ${leftOpen ? 'open' : ''}`} aria-label="工具选择面板">
        <div className="tm-panel-title">
          工具选择
          <button className="tm-icon-btn drawer-close" onClick={() => setLeftOpen(false)} aria-label="关闭">×</button>
        </div>
        {leftPanel}
      </aside>
      {leftOpen && <div className="tm-scrim" onClick={() => setLeftOpen(false)} />}

      <main className="tm-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onInit={(i) => (instanceRef.current = i)}
          onNodeClick={(_, n) => { setSel({ kind: 'node', id: n.id }); setRightOpen(true); }}
          onEdgeClick={(_, e) => { setSel({ kind: 'edge', id: e.id }); setRightOpen(true); }}
          onPaneClick={() => setSel(null)}
          onNodeDragStart={() => pushHistory()}
          isValidConnection={(c) => c.source !== c.target}
          minZoom={0.2}
          maxZoom={2.2}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          nodesDraggable
          nodesConnectable
          edgesReconnectable
          deleteKeyCode={['Backspace', 'Delete']}
          zoomOnDoubleClick={false}
        >
          <Background color="#cbd5e1" gap={26} />
          <Controls showInteractive={false} position="bottom-left" />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            maskColor="rgba(148,163,184,.25)"
            nodeColor={(n) => capColor(((n.data as { capIndex?: number })?.capIndex) ?? 0)}
          />
          {nodes.length === 0 && (
            <div className="wf-empty-hint">
              从左侧把工具加入画布（或载入模板），然后从节点右侧锚点拖向另一个节点创建连线。
            </div>
          )}
        </ReactFlow>

        {toast && <div className="wf-toast" role="status">{toast}</div>}
      </main>

      <aside className={`tm-right ${rightOpen ? 'open' : ''}`} aria-label="属性与检查面板">
        <div className="tm-panel-title">
          属性与检查
          <button className="tm-icon-btn drawer-close" onClick={() => setRightOpen(false)} aria-label="关闭">×</button>
        </div>
        {rightPanel}
      </aside>
    </div>
  );
}

function pairKeyOf(a: string, b: string): string {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()].sort();
  return `${x}::${y}`;
}
