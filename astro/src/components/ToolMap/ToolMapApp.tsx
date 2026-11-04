import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export type ToolMapTool = {
  repo: string; // owner/repo
  name: string;
  category: string;
  stars?: number;
};

type Props = {
  tools: ToolMapTool[];
};

const nodeStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 10,
  padding: '8px 12px',
  fontSize: 13,
  minWidth: 150,
  fontFamily: 'inherit',
};

export default function ToolMapApp({ tools }: Props) {
  // 阶段1技术验证：真实工具按网格铺开；阶段3 替换为聚类布局 + 关系边
  const nodes: Node[] = useMemo(
    () =>
      tools.map((t, i) => ({
        id: t.repo,
        position: { x: (i % 5) * 220, y: Math.floor(i / 5) * 110 },
        data: {
          label: (
            <div>
              <div style={{ fontWeight: 700, color: '#1e3a5f' }}>{t.name}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{t.repo}</div>
            </div>
          ),
        },
        style: nodeStyle,
      })),
    [tools],
  );

  const edges: Edge[] = useMemo(() => [], []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      fitView
      minZoom={0.2}
      maxZoom={2}
      nodesDraggable
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#cbd5e1" gap={24} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable />
    </ReactFlow>
  );
}
