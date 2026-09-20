import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';

export interface StateNodeData extends Record<string, unknown> {
  name: string;
  initial: boolean;
  final: boolean;
  issue: 'error' | 'warning' | null;
  simCurrent: boolean;
}

export type StateNodeType = Node<StateNodeData, 'fsmState'>;

export function StateNode({ data, selected }: NodeProps<StateNodeType>) {
  const classes = [
    'state-node',
    data.issue ? `issue-${data.issue}` : '',
    data.simCurrent ? 'sim-current' : '',
    selected ? 'selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <Handle type="target" position={Position.Left} id="tl" className="handle" />
      <Handle type="target" position={Position.Top} id="tt" className="handle" />
      <div className="state-name" title={data.name}>
        {data.name}
      </div>
      {(data.initial || data.final) && (
        <div className="state-badges">
          {data.initial && <span className="badge badge-initial">初始</span>}
          {data.final && <span className="badge badge-final">终态</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} id="sr" className="handle" />
      <Handle type="source" position={Position.Bottom} id="sb" className="handle" />
    </div>
  );
}
