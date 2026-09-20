import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';

/** 自环转换：从节点右侧绕到节点左侧的弧线。 */
export function SelfLoopEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  markerEnd,
  className,
}: EdgeProps & { className?: string }) {
  const lift = 64;
  const path = `M ${sourceX} ${sourceY} C ${sourceX + 70} ${sourceY - lift * 2}, ${targetX - 70} ${targetY - lift * 2}, ${targetX} ${targetY}`;
  const labelX = (sourceX + targetX) / 2;
  const labelY = Math.min(sourceY, targetY) - lift;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} className={className} />
      {label != null && (
        <EdgeLabelRenderer>
          <div
            className="edge-label self-loop-label"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
