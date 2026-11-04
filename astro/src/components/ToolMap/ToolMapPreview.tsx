import { useMemo } from 'react';
import { REL_STYLE, capColor, type RelationType } from './types';

/**
 * 首页「AI 工具生态地图」预览（阶段4）。
 * 数据在构建期由 index.astro 从 astro/public/data/tool-map.json 取真实样本传入：
 * —— 点位 = 工具真实集群坐标等比缩放；连线 = 真实关系的两端点；
 * —— 只读展示，无编辑控件；点击 CTA 进入完整地图。
 */
type PreviewNode = [x: number, y: number, capIndex: number];
type PreviewEdge = [from: number, to: number, typeIndex: number];

export type ToolMapPreviewProps = {
  stats?: { mapNodes?: number; relationTotal?: number };
  capabilityCount?: number;
  nodes?: PreviewNode[];
  edges?: PreviewEdge[];
  baseUrl?: string; // '/AI-Shovel-Collection'
};

const REL_TYPES: RelationType[] = ['integration', 'protocol', 'complementary', 'alternative'];
const W = 460;
const H = 240;
const PAD = 18;

export default function ToolMapPreview({
  stats,
  capabilityCount = 0,
  nodes = [],
  edges = [],
  baseUrl = '/AI-Shovel-Collection',
}: ToolMapPreviewProps) {
  const { pts, lines } = useMemo(() => {
    if (!nodes.length) return { pts: [] as { x: number; y: number; c: string }[], lines: [] as { x1: number; y1: number; x2: number; y2: number; color: string; dashed: boolean }[] };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of nodes) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    const sx = (W - PAD * 2) / Math.max(1, maxX - minX);
    const sy = (H - PAD * 2) / Math.max(1, maxY - minY);
    const s = Math.min(sx, sy);
    const map = ([x, y]: [number, number]) => ({
      x: PAD + (x - minX) * s,
      y: PAD + (y - minY) * s,
    });
    const pts = nodes.map(([x, y, ci]) => ({ ...map([x, y]), c: capColor(ci) }));
    const lines = edges
      .map(([a, b, ti]) => {
        const pa = pts[a];
        const pb = pts[b];
        if (!pa || !pb) return null;
        const st = REL_STYLE[REL_TYPES[ti]] || REL_STYLE.alternative;
        return { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, color: st.color, dashed: st.dashed };
      })
      .filter(Boolean) as { x1: number; y1: number; x2: number; y2: number; color: string; dashed: boolean }[];
    return { pts, lines };
  }, [nodes, edges]);

  const ready = nodes.length > 0;

  return (
    <section
      aria-label="AI 工具生态地图预览"
      style={{
        maxWidth: 1080,
        margin: '26px auto 6px',
        padding: '22px 26px',
        borderRadius: 16,
        background: 'linear-gradient(135deg,#0f172a 0%,#1e3a8a 62%,#312e81 100%)',
        color: '#fff',
        display: 'flex',
        gap: 26,
        alignItems: 'center',
        flexWrap: 'wrap',
        boxShadow: '0 8px 30px rgba(15,23,42,.25)',
      }}
    >
      <div style={{ flex: '1 1 300px', minWidth: 260 }}>
        <div style={{ fontSize: '.78rem', letterSpacing: '.08em', opacity: 0.75, fontWeight: 700 }}>
          AI TOOL MAP · 生态地图
        </div>
        <h2 style={{ margin: '8px 0 8px', fontSize: '1.45rem', lineHeight: 1.3 }}>
          看清工具之间怎么连
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: '.88rem', lineHeight: 1.65, opacity: 0.85 }}>
          按能力领域聚类的可交互关系网络：集成、互补与替代关系全部基于真实数据，
          {ready ? (
            <b>
              {' '}
              {stats?.mapNodes ?? nodes.length} 个工具 · {stats?.relationTotal ?? edges.length} 条关系 ·{' '}
              {capabilityCount} 个能力域
            </b>
          ) : (
            ' 数据构建中'
          )}
          。支持搜索、过滤、上下游追溯与证据查看。
        </p>
        <a
          href={`${baseUrl}/tool-map/`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 22px',
            borderRadius: 10,
            background: '#fbbf24',
            color: '#1e3a5f',
            fontWeight: 800,
            fontSize: '.92rem',
            textDecoration: 'none',
            transition: 'transform .15s',
          }}
        >
          🗺️ 进入完整地图 →
        </a>
      </div>

      <div
        style={{ flex: '0 1 470px', minWidth: 260 }}
        aria-hidden="true"
      >
        {ready ? (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: 'auto', display: 'block', background: 'rgba(255,255,255,.06)', borderRadius: 12, border: '1px solid rgba(255,255,255,.14)' }}
          >
            {lines.map((l, i) => (
              <line
                key={`e${i}`}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke={l.color}
                strokeWidth={1.4}
                strokeDasharray={l.dashed ? '5 4' : undefined}
                opacity={0.85}
              />
            ))}
            {pts.map((p, i) => (
              <circle key={`n${i}`} cx={p.x} cy={p.y} r={3.1} fill={p.c} stroke="rgba(255,255,255,.65)" strokeWidth={0.7} />
            ))}
          </svg>
        ) : (
          <div
            style={{
              height: H,
              borderRadius: 12,
              border: '1px dashed rgba(255,255,255,.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '.85rem',
              opacity: 0.7,
            }}
          >
            地图数据加载中…
          </div>
        )}
      </div>
    </section>
  );
}
