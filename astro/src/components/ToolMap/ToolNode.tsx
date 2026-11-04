import { memo, useContext } from 'react';
import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';
import { capColor, type MapNodeData } from './types';
import { MapInteractionContext } from './context';

type ToolFlowNodeData = {
  tool: MapNodeData;
  capIndex: number;
};

function ToolNodeInner({ data }: NodeProps) {
  const d = data as unknown as ToolFlowNodeData;
  const { tool, capIndex } = d;
  const zoom = useStore((s) => s.transform[2]);
  const { selectedId, hoverId, neighbors } = useContext(MapInteractionContext);

  const color = capColor(capIndex);
  // 按缩放切换内容密度：远景 <0.45 / 中景 0.45–0.9 / 近景 >0.9
  const density: 'far' | 'mid' | 'near' = zoom < 0.45 ? 'far' : zoom < 0.9 ? 'mid' : 'near';
  const isSel = selectedId === tool.id;
  const isHov = hoverId === tool.id;
  const hasSel = selectedId != null;
  const related = hasSel && neighbors.has(tool.id) && !isSel;
  const dimmed = hasSel && !isSel && !neighbors.has(tool.id);

  const cls = [
    'tm-node',
    isSel && 'is-selected',
    isHov && 'is-hover',
    related && 'is-related',
    dimmed && 'is-dimmed',
  ]
    .filter(Boolean)
    .join(' ');

  const stars =
    typeof tool.stars === 'number' && tool.stars > 0
      ? tool.stars >= 1000
        ? `${(tool.stars / 1000).toFixed(tool.stars >= 10000 ? 0 : 1)}k`
        : String(tool.stars)
      : null;

  return (
    <div className={cls} style={{ ['--node-color' as string]: color }}>
      <Handle type="target" position={Position.Left} className="tm-handle" />
      <div className="tm-node-head">
        <span className="tm-node-dot" aria-hidden="true" />
        <span className="tm-node-name" title={tool.name}>
          {tool.name}
        </span>
        {stars && density !== 'far' && <span className="tm-node-stars">★{stars}</span>}
      </div>
      {density !== 'far' && (
        <div className="tm-node-sub">
          <span className="tm-node-type">{tool.category.split('、')[0]}</span>
          {tool.eval?.grade && (
            <span className={`tm-node-eval g-${tool.eval.grade}`}>{tool.eval.grade}</span>
          )}
        </div>
      )}
      {density === 'near' && (
        <div className="tm-node-tags">
          {tool.capabilities.slice(0, 2).map((c) => (
            <span key={c} className="tm-node-tag">
              {c}
            </span>
          ))}
          {tool.lang && <span className="tm-node-tag lang">{tool.lang}</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="tm-handle" />
    </div>
  );
}

export const ToolNode = memo(ToolNodeInner);
export default ToolNode;
