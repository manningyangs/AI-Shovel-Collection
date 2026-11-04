import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './tool-map.css';
import ToolNode from './ToolNode';
import ToolEdge from './ToolEdge';
import { MapInteractionContext } from './context';
import {
  EVIDENCE_LABEL,
  REL_STYLE,
  capColor,
  type MapData,
  type MapNodeData,
  type RelationData,
  type RelationType,
} from './types';

const ALL_REL_TYPES: RelationType[] = ['integration', 'protocol', 'complementary', 'alternative'];
const nodeTypes = { tool: ToolNode };
const edgeTypes = { tool: ToolEdge };

type Filters = {
  query: string;
  caps: Set<string>;
  langs: Set<string>;
  relTypes: Set<RelationType>;
  showInferred: boolean;
  evalFilter: 'all' | 'evaluated' | 'unevaluated';
  minStars: number;
  onlyRelated: boolean;
};

const EMPTY_FILTERS: Filters = {
  query: '',
  caps: new Set(),
  langs: new Set(),
  relTypes: new Set(ALL_REL_TYPES),
  showInferred: true,
  evalFilter: 'all',
  minStars: 0,
  onlyRelated: false,
};

export default function ToolMapApp() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedRelId, setSelectedRelId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(false); // 移动端抽屉
  const [detailOpen, setDetailOpen] = useState(true); // 桌面右栏收起
  const [isMobile, setIsMobile] = useState(false);
  const instanceRef = useRef<ReactFlowInstance | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  /* ---------- 数据加载（按需：仅进入地图页才 fetch） ---------- */
  useEffect(() => {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
    fetch(`${base}/data/tool-map.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: MapData) => setData(d))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  /* ---------- 派生索引 ---------- */
  const capIndexMap = useMemo(() => {
    const m: Record<string, number> = {};
    data?.capabilities.forEach((c, i) => (m[c.id] = i));
    return m;
  }, [data]);

  const relByNode = useMemo(() => {
    const m = new Map<string, RelationData[]>();
    data?.relations.forEach((r) => {
      (m.get(r.source) || m.set(r.source, []).get(r.source)!).push(r);
      (m.get(r.target) || m.set(r.target, []).get(r.target)!).push(r);
    });
    return m;
  }, [data]);

  const neighbors = useMemo(() => {
    const s = new Set<string>();
    if (selectedId) relByNode.get(selectedId)?.forEach((r) => { s.add(r.source); s.add(r.target); });
    return s;
  }, [selectedId, relByNode]);

  /* ---------- 过滤 ---------- */
  const visibleNodes = useMemo(() => {
    if (!data) return [];
    const q = filters.query.trim().toLowerCase();
    return data.nodes.filter((n) => {
      if (filters.caps.size && !filters.caps.has(n.capability)) return false;
      if (filters.langs.size && !(n.lang && filters.langs.has(n.lang))) return false;
      if (filters.evalFilter === 'evaluated' && !n.eval) return false;
      if (filters.evalFilter === 'unevaluated' && n.eval) return false;
      if (filters.minStars && (n.stars || 0) < filters.minStars) return false;
      if (q) {
        const hay = `${n.name} ${n.id} ${n.category} ${n.desc || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.onlyRelated && selectedId && n.id !== selectedId && !neighbors.has(n.id)) return false;
      return true;
    });
  }, [data, filters, selectedId, neighbors]);

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const visibleRels = useMemo(() => {
    if (!data) return [];
    return data.relations.filter(
      (r) =>
        filters.relTypes.has(r.type) &&
        (filters.showInferred || r.evidenceLevel !== 'inferred') &&
        visibleNodeIds.has(r.source) &&
        visibleNodeIds.has(r.target) &&
        (!selectedId || r.source === selectedId || r.target === selectedId),
    );
  }, [data, filters.relTypes, filters.showInferred, visibleNodeIds, selectedId]);

  /* ---------- 同步到 React Flow（仅过滤/数据变化时重建；选中/悬停走 Context） ---------- */
  useEffect(() => {
    setNodes(
      visibleNodes.map((n) => ({
        id: n.id,
        type: 'tool',
        position: n.position,
        data: { tool: n, capIndex: capIndexMap[n.capability] ?? 0 },
      })),
    );
  }, [visibleNodes, capIndexMap, setNodes]);

  useEffect(() => {
    setEdges(
      visibleRels.map((r) => {
        const touches = selectedId ? r.source === selectedId || r.target === selectedId : false;
        return {
          id: r.id,
          source: r.source,
          target: r.target,
          type: 'tool',
          data: { relation: r, highlighted: !!selectedId && touches, dimmed: !!selectedId && !touches },
          markerEnd: { type: 'arrowclosed', width: 14, height: 14, color: REL_STYLE[r.type].color },
        };
      }),
    );
  }, [visibleRels, selectedId, setEdges]);

  /* ---------- 语言选项（真实数据聚合） ---------- */
  const langOptions = useMemo(() => {
    const m = new Map<string, number>();
    data?.nodes.forEach((n) => n.lang && m.set(n.lang, (m.get(n.lang) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [data]);

  /* ---------- 交互 ---------- */
  const onSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedRelId(null);
    if (id && isMobile) setDetailOpen(true);
  }, [isMobile]);

  const resetAll = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setSelectedId(null);
    setSelectedRelId(null);
    if (data) {
      setNodes(
        data.nodes.map((n) => ({
          id: n.id,
          type: 'tool',
          position: n.position,
          data: { tool: n, capIndex: capIndexMap[n.capability] ?? 0 },
        })),
      );
    }
    setTimeout(() => instanceRef.current?.fitView({ padding: 0.15, duration: 350 }), 30);
  }, [data, capIndexMap, setNodes]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  }, []);

  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));
  const toggleInSet = <T,>(s: Set<T>, v: T): Set<T> => {
    const n = new Set(s);
    n.has(v) ? n.delete(v) : n.add(v);
    return n;
  };

  const selectedNode = data?.nodes.find((n) => n.id === selectedId) || null;
  const selectedRel = data?.relations.find((r) => r.id === selectedRelId) || null;
  const selectedRels = selectedId ? relByNode.get(selectedId) || [] : [];
  const upstream = selectedRels.filter((r) => r.target === selectedId);
  const downstream = selectedRels.filter((r) => r.source === selectedId);

  /* ---------- 渲染 ---------- */
  if (error) return <div className="tm-status tm-error">地图数据加载失败：{error}</div>;
  if (!data)
    return <div className="tm-status tm-loading"><span className="tm-spinner" />正在加载工具地图…</div>;

  const s = data.stats as Record<string, any>;

  const searchBox = (
    <input
      type="search"
      className="tm-search"
      placeholder="搜索工具名称 / 仓库 / 描述…"
      value={filters.query}
      onChange={(e) => patch({ query: e.target.value })}
      aria-label="搜索工具"
    />
  );

  const relTypeChecks = (
    <div className="tm-group">
      <div className="tm-group-title">关系类型</div>
      {ALL_REL_TYPES.map((t) => (
        <label key={t} className="tm-check">
          <input
            type="checkbox"
            checked={filters.relTypes.has(t)}
            onChange={() => patch({ relTypes: toggleInSet(filters.relTypes, t) })}
          />
          <span className="tm-swatch" style={{ background: REL_STYLE[t].color, borderStyle: REL_STYLE[t].dashed ? 'dashed' : 'solid' }} />
          {REL_STYLE[t].label}
          <span className="tm-count">{data.relations.filter((r) => r.type === t).length}</span>
        </label>
      ))}
      <label className="tm-check subtle">
        <input
          type="checkbox"
          checked={filters.showInferred}
          onChange={(e) => patch({ showInferred: e.target.checked })}
        />
        弱化显示「推断」关系
      </label>
    </div>
  );

  const leftPanel = (
    <div className="tm-left-inner">
      <div className="tm-group">
        <div className="tm-group-title">
          能力领域
          {filters.caps.size > 0 && (
            <button className="tm-link-btn" onClick={() => patch({ caps: new Set() })}>清除</button>
          )}
        </div>
        <label className="tm-check" style={{ fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={filters.caps.size === 0}
            onChange={() => patch({ caps: new Set() })}
          />
          全部工具 <span className="tm-count">{data.nodes.length}</span>
        </label>
        {data.capabilities.map((c) => {
          const cnt = data.nodes.filter((n) => n.capability === c.id).length;
          if (!cnt) return null;
          return (
            <label key={c.id} className="tm-check" title={c.description}>
              <input
                type="checkbox"
                checked={filters.caps.has(c.id)}
                onChange={() => patch({ caps: toggleInSet(filters.caps, c.id) })}
              />
              <span className="tm-swatch" style={{ background: capColor(data.capabilities.indexOf(c)) }} />
              {c.name}
              <span className="tm-count">{cnt}</span>
            </label>
          );
        })}
      </div>

      {langOptions.length > 0 && (
        <div className="tm-group">
          <div className="tm-group-title">
            编程语言
            {filters.langs.size > 0 && (
              <button className="tm-link-btn" onClick={() => patch({ langs: new Set() })}>清除</button>
            )}
          </div>
          <div className="tm-chips">
            {langOptions.map(([l, c]) => (
              <button
                key={l}
                className={`tm-chip ${filters.langs.has(l) ? 'on' : ''}`}
                onClick={() => patch({ langs: toggleInSet(filters.langs, l) })}
              >
                {l} <span className="tm-count">{c}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {relTypeChecks}

      <div className="tm-group">
        <div className="tm-group-title">评测状态</div>
        {([['all', '全部'], ['evaluated', '已评测'], ['unevaluated', '未评测']] as const).map(([v, label]) => (
          <label key={v} className="tm-check">
            <input
              type="radio"
              name="tm-eval"
              checked={filters.evalFilter === v}
              onChange={() => patch({ evalFilter: v })}
            />
            {label}
            <span className="tm-count">
              {v === 'all' ? data.nodes.length : v === 'evaluated' ? s.evaluatedTools : data.nodes.length - s.evaluatedTools}
            </span>
          </label>
        ))}
      </div>

      <div className="tm-group">
        <div className="tm-group-title">最低 Stars</div>
        <select
          className="tm-select"
          value={filters.minStars}
          onChange={(e) => patch({ minStars: Number(e.target.value) })}
        >
          <option value={0}>不限</option>
          <option value={100}>≥ 100</option>
          <option value={1000}>≥ 1,000</option>
          <option value={10000}>≥ 10,000</option>
        </select>
      </div>

      <div className="tm-group tm-legend">
        <div className="tm-group-title">图例</div>
        {ALL_REL_TYPES.map((t) => (
          <div key={t} className="tm-legend-row">
            <svg width="34" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="33" y2="5" stroke={REL_STYLE[t].color} strokeWidth="2.4" strokeDasharray={REL_STYLE[t].dashed ? '6 4' : undefined} />
            </svg>
            {REL_STYLE[t].label}
          </div>
        ))}
        <div className="tm-legend-note">
          证据等级：{(['verified', 'documented', 'inferred'] as const).map((e) => EVIDENCE_LABEL[e]).join(' / ')}
          <br />推断关系默认弱化，不作为确定关系。
        </div>
      </div>

      <button className="tm-btn ghost wide" onClick={resetAll}>清除全部筛选并重置视图</button>
    </div>
  );

  const detailPanel = selectedNode ? (
    <div className="tm-detail-inner">
      <div className="tm-detail-head">
        <h3 title={selectedNode.name}>{selectedNode.name}</h3>
        <button className="tm-icon-btn" onClick={() => onSelect(null)} aria-label="关闭详情">×</button>
      </div>
      <div className="tm-detail-repo" title={selectedNode.id}>
        <a href={`https://github.com/${selectedNode.id}`} target="_blank" rel="noopener">
          {selectedNode.id} ↗
        </a>
      </div>

      <dl className="tm-kv">
        <dt>所属分类</dt><dd>{selectedNode.category}</dd>
        <dt>能力领域</dt>
        <dd>
          <span className="tm-badge" style={{ borderColor: capColor(capIndexMap[selectedNode.capability] ?? 0) }}>
            {data.capabilities.find((c) => c.id === selectedNode.capability)?.name || selectedNode.capability}
          </span>
        </dd>
        {selectedNode.lang && (<><dt>编程语言</dt><dd>{selectedNode.lang}</dd></>)}
        {typeof selectedNode.stars === 'number' && selectedNode.stars > 0 && (
          <><dt>Stars</dt><dd>★ {selectedNode.stars.toLocaleString()}</dd></>
        )}
        {selectedNode.pushedAt && (
          <><dt>最近更新</dt><dd>{selectedNode.pushedAt.slice(0, 10)}</dd></>
        )}
        <dt>评测</dt>
        <dd>
          {selectedNode.eval ? (
            <span className={`tm-eval-badge g-${selectedNode.eval.grade}`}>
              {selectedNode.eval.level} · {selectedNode.eval.grade} · {selectedNode.eval.score} 分
              <a className="tm-eval-link" href={`/AI-Shovel-Collection/evaluations/${selectedNode.eval.reportId}/`}>报告 →</a>
            </span>
          ) : (
            <span className="tm-muted">未评测</span>
          )}
        </dd>
      </dl>

      {selectedNode.summary && <p className="tm-detail-summary">{selectedNode.summary}</p>}

      <div className="tm-detail-rel">
        <div className="tm-sub-title">
          关系 <span className="tm-count">{selectedRels.length}</span>
        </div>
        {selectedRels.length === 0 && <p className="tm-muted">暂无已收录的可靠关系（独立节点也是地图的一部分）。</p>}
        {upstream.length > 0 && (
          <>
            <div className="tm-sub-label">↑ 上游（指向它）</div>
            {upstream.map((r) => (
              <RelRow key={r.id} r={r} other={r.source} onSelect={onSelect} onRel={setSelectedRelId} />
            ))}
          </>
        )}
        {downstream.length > 0 && (
          <>
            <div className="tm-sub-label">↓ 下游（它指出）</div>
            {downstream.map((r) => (
              <RelRow key={r.id} r={r} other={r.target} onSelect={onSelect} onRel={setSelectedRelId} />
            ))}
          </>
        )}
      </div>

      <a className="tm-btn primary wide" href={selectedNode.detailUrl}>查看完整工具详情 →</a>
    </div>
  ) : (
    <div className="tm-detail-inner tm-detail-empty">
      <p className="tm-muted">点击画布中的工具节点，查看其信息、关系与证据。</p>
      <div className="tm-mini-stats">
        <div><b>{s.mapNodes}</b><span>有效工具节点</span></div>
        <div><b>{s.relationTotal}</b><span>已收录关系</span></div>
        <div><b>{s.relationByEvidence?.documented || 0}</b><span>文档支持关系</span></div>
      </div>
    </div>
  );

  return (
    <MapInteractionContext.Provider value={{ selectedId, hoverId, neighbors, onSelect }}>
      <div className={`tm-app ${leftOpen ? 'left-open' : ''} ${detailOpen && selectedNode ? 'right-open' : ''}`}>
        {/* 顶部工具栏 */}
        <div className="tm-toolbar">
          <a
            className="tm-icon-btn"
            href={`${(import.meta.env.BASE_URL || '/').replace(/\/+$/, '')}/`}
            title="返回首页"
            aria-label="返回首页"
          >←</a>
          <button
            type="button"
            className="tm-icon-btn drawer-toggle"
            onMouseDown={(e) => e.preventDefault() /* 阻止焦点导致的布局滚动，保证 click 落点 */}
            onClick={() => setLeftOpen((v) => !v)}
            aria-label="打开筛选"
          >☰</button>
          {searchBox}
          <button
            className={`tm-btn ${filters.onlyRelated ? 'on' : 'ghost'}`}
            disabled={!selectedId}
            title={selectedId ? '只看选中工具的相关网络' : '先选择一个工具'}
            onClick={() => patch({ onlyRelated: !filters.onlyRelated })}
          >只看相关</button>
          <button
            className="tm-btn ghost"
            onClick={() => {
              patch({ onlyRelated: false });
              setSelectedId(null);
              setSelectedRelId(null);
              setHoverId(null);
              instanceRef.current?.fitView({ padding: 0.15, duration: 300 });
            }}
          >重置视图</button>
          <button className="tm-btn ghost" onClick={toggleFullscreen} title="全屏">⛶</button>
          <span className="tm-tally" aria-live="polite">
            {visibleNodes.length} / {data.nodes.length} 节点 · {visibleRels.length} 关系
          </span>
        </div>

        {/* 左：过滤面板 */}
        <aside className={`tm-left ${leftOpen ? 'open' : ''}`} aria-label="过滤面板">
          <div className="tm-panel-title">
            筛选
            <button className="tm-icon-btn drawer-close" onClick={() => setLeftOpen(false)} aria-label="关闭">×</button>
          </div>
          {leftPanel}
        </aside>
        {leftOpen && <div className="tm-scrim" onClick={() => setLeftOpen(false)} />}

        {/* 中：画布 */}
        <main className="tm-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={(i) => (instanceRef.current = i)}
            onNodeClick={(_, n) => onSelect(n.id)}
            onNodeMouseEnter={(_, n) => setHoverId(n.id)}
            onNodeMouseLeave={() => setHoverId(null)}
            onEdgeClick={(_, e) => setSelectedRelId(e.id)}
            onPaneClick={() => { onSelect(null); setHoverId(null); }}
            minZoom={0.15}
            maxZoom={2.2}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            proOptions={{ hideAttribution: true }}
            nodesDraggable
            nodesConnectable={false}
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
          </ReactFlow>

          {/* 关系详情浮层 */}
          {selectedRel && (
            <div className="tm-rel-pop" role="dialog" aria-label="关系详情">
              <div className="tm-rel-pop-head">
                <span className="tm-badge" style={{ background: REL_STYLE[selectedRel.type].color, color: '#fff', borderColor: 'transparent' }}>
                  {REL_STYLE[selectedRel.type].label}
                </span>
                <span className={`tm-badge ev-${selectedRel.evidenceLevel}`}>{EVIDENCE_LABEL[selectedRel.evidenceLevel]}</span>
                <button className="tm-icon-btn" onClick={() => setSelectedRelId(null)} aria-label="关闭">×</button>
              </div>
              <p className="tm-rel-pop-desc">{selectedRel.description}</p>
              <div className="tm-rel-pop-ends">
                <button onClick={() => onSelect(selectedRel.source)}>{selectedRel.source}</button>
                <span aria-hidden="true">→</span>
                <button onClick={() => onSelect(selectedRel.target)}>{selectedRel.target}</button>
              </div>
              {selectedRel.evidence && selectedRel.evidence.length > 0 && (
                <ul className="tm-rel-pop-ev">
                  {selectedRel.evidence.map((e, i) => (
                    <li key={i}>
                      <a href={e.url} target="_blank" rel="noopener">证据：{e.url}</a>
                    </li>
                  ))}
                </ul>
              )}
              {selectedRel.updatedAt && <div className="tm-rel-pop-date">更新于 {selectedRel.updatedAt}</div>}
            </div>
          )}
        </main>

        {/* 右：详情面板（桌面可收起；移动端底部面板） */}
        <aside className={`tm-right ${detailOpen && selectedNode ? 'open' : ''}`} aria-label="工具详情">
          <div className="tm-panel-title">
            工具详情
            <button className="tm-icon-btn" onClick={() => setDetailOpen(false)} aria-label="收起">›</button>
          </div>
          {detailPanel}
        </aside>
        {isMobile && selectedNode && !detailOpen && (
          <button className="tm-detail-fab" onClick={() => setDetailOpen(true)}>
            {selectedNode.name.length > 14 ? selectedNode.name.slice(0, 14) + '…' : selectedNode.name} ▲
          </button>
        )}
      </div>
    </MapInteractionContext.Provider>
  );
}

/* 关系行（详情面板内） */
function RelRow({
  r,
  other,
  onSelect,
  onRel,
}: {
  r: RelationData;
  other: string;
  onSelect: (id: string | null) => void;
  onRel: (id: string) => void;
}) {
  return (
    <div className="tm-rel-row">
      <span
        className="tm-swatch"
        style={{ background: REL_STYLE[r.type].color, borderStyle: REL_STYLE[r.type].dashed ? 'dashed' : 'solid' }}
        title={REL_STYLE[r.type].label}
      />
      <button className="tm-rel-row-name" onClick={() => onSelect(other)} title={`查看 ${other}`}>
        {other}
      </button>
      <button className="tm-rel-row-detail" onClick={() => onRel(r.id)} title="查看关系详情">ⓘ</button>
    </div>
  );
}
