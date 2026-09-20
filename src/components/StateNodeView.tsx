import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { StateNode } from '../types';

type Decorations = {
  issues?: number;
  hasError?: boolean;
  hasWarning?: boolean;
  reachable?: boolean;
  active?: boolean;
  dimmed?: boolean;
};

type Props = NodeProps<StateNode> & { data: StateNode['data'] & Decorations };

function StateNodeView({ data, selected }: Props) {
  const issues = data.issues;
  const hasError = data.hasError;
  const hasWarning = data.hasWarning;
  const reachable = data.reachable ?? true;
  const active = data.active;
  const dimmed = data.dimmed;
  const classes = ['state-node'];
  if (data.initial) classes.push('is-initial');
  if (data.final) classes.push('is-final');
  if (hasError) classes.push('has-error');
  if (hasWarning) classes.push('has-warning');
  if (selected) classes.push('is-selected');
  if (active) classes.push('is-active');
  if (!reachable) classes.push('is-unreachable');
  if (dimmed) classes.push('is-dimmed');

  return (
    <div className={classes.join(' ')}>
      <Handle type="target" position={Position.Left} className="state-handle" />
      <Handle type="target" position={Position.Top} className="state-handle" id="t" />
      <div className="state-node-header">
        {data.initial && <span className="state-badge state-badge-initial" title="初始状态">● 初始</span>}
        {data.final && <span className="state-badge state-badge-final" title="结束状态">■ 结束</span>}
        {issues ? (
          <span className={`state-badge state-badge-issue ${hasError ? 'is-error' : 'is-warning'}`}>
            {issues}
          </span>
        ) : null}
      </div>
      <div className="state-node-label">{data.label || '(未命名)'}</div>
      <Handle type="source" position={Position.Right} className="state-handle" />
      <Handle type="source" position={Position.Bottom} className="state-handle" id="b" />
    </div>
  );
}

export default memo(StateNodeView);
