import { memo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { EVIDENCE_LABEL, REL_STYLE, type RelationData } from './types';

type ToolFlowEdgeData = {
  relation: RelationData;
  dimmed?: boolean;
  highlighted?: boolean;
  /** 候选关系（未审核，独立样式，不作为公共事实） */
  candidate?: boolean;
};

function ToolEdgeInner({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps) {
  const d = data as unknown as ToolFlowEdgeData;
  const rel = d.relation;
  const style = REL_STYLE[rel.type];
  const [hover, setHover] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.28,
  });

  const dimmed = d.dimmed && !selected;
  const emphasized = d.highlighted || selected || hover;
  const candidate = d.candidate;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: style.color,
          strokeWidth: emphasized ? 2.6 : 1.4,
          strokeDasharray: candidate ? '3 4' : style.dashed ? '7 5' : undefined,
          opacity: dimmed ? 0.12 : candidate ? (emphasized ? 0.85 : 0.4) : emphasized ? 1 : 0.55,
          transition: 'opacity .15s, stroke-width .15s',
        }}
        interactionWidth={14}
      />
      {/* hover 关系说明（任务书 §6.3：Hover 显示关系说明） */}
      {(hover || selected) && (
        <EdgeLabelRenderer>
          <div
            className="tm-edge-label"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
          >
            <span className="tm-edge-label-type" style={{ background: style.color }}>
              {style.label}
            </span>
            {candidate && <span className="tm-edge-label-cand">候选·未审核</span>}
            <span className="tm-edge-label-desc">{rel.description}</span>
            <span className="tm-edge-label-ev">{EVIDENCE_LABEL[rel.evidenceLevel]}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ToolEdge = memo(ToolEdgeInner);
export default ToolEdge;
