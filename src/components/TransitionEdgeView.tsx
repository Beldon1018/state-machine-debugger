import { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react';
import type { TransitionEdgeData } from '../types';

type EdgeDecorations = {
  hasError?: boolean;
  hasWarning?: boolean;
  active?: boolean;
};

type Props = EdgeProps<Edge<TransitionEdgeData & EdgeDecorations, 'transition'>> & {
  onLabelClick?: (id: string) => void;
};

function TransitionEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
  selected,
  onLabelClick,
}: Props) {
  const hasError = data?.hasError;
  const hasWarning = data?.hasWarning;
  const active = data?.active;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const classes = ['transition-edge-label'];
  if (selected) classes.push('is-selected');
  if (hasError) classes.push('has-error');
  if (hasWarning) classes.push('has-warning');
  if (active) classes.push('is-active');

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: active
            ? '#22c55e'
            : hasError
              ? '#ef4444'
              : hasWarning
                ? '#f59e0b'
                : '#64748b',
          strokeWidth: active ? 3.5 : selected ? 2.5 : 1.5,
        }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={classes.join(' ')}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          onClick={(e) => {
            e.stopPropagation();
            onLabelClick?.(id);
          }}
          title="点击选中该转换"
        >
          <span className="edge-event">{data?.event?.trim() ? data.event : '(无事件)'}</span>
          {data?.guard?.trim() ? <span className="edge-guard">[{data.guard}]</span> : null}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(TransitionEdgeView);
