import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Machine } from '../model/types';
import {
  addState,
  addTransition,
  cloneMachine,
  removeStates,
  removeTransitions,
} from '../model/machine';
import { StateNode, type StateNodeType } from './StateNode';
import { SelfLoopEdge } from './SelfLoopEdge';
import { NODE_HEIGHT, NODE_WIDTH } from '../model/layout';

export type Selection = { kind: 'state' | 'transition'; id: string } | null;
export type SelectionUpdater = Selection | ((prev: Selection) => Selection);

const nodeTypes = { fsmState: StateNode };
const edgeTypes = { selfloop: SelfLoopEdge };

export interface FlowCanvasProps {
  machine: Machine;
  nodeIssue: Map<string, 'error' | 'warning'>;
  edgeIssue: Map<string, 'error' | 'warning'>;
  simCurrentId: string | null;
  simActiveTransitionId: string | null;
  selection: Selection;
  onSelect: (sel: SelectionUpdater) => void;
  onLiveChange: (next: Machine) => void;
  onCommit: (next: Machine) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onInit: (instance: ReactFlowInstance) => void;
}

export function FlowCanvas(props: FlowCanvasProps) {
  const {
    machine,
    nodeIssue,
    edgeIssue,
    simCurrentId,
    simActiveTransitionId,
    selection,
    onSelect,
    onLiveChange,
    onCommit,
    onDragStart,
    onDragEnd,
    onInit,
  } = props;

  const rf = useReactFlow();

  const nodes: Node[] = useMemo(
    () =>
      machine.states.map((s) => ({
        id: s.id,
        type: 'fsmState' as const,
        position: { x: s.x, y: s.y },
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        data: {
          name: s.name,
          initial: s.initial,
          final: s.final,
          issue: nodeIssue.get(s.id) ?? null,
          simCurrent: simCurrentId === s.id,
        },
        selected: selection?.kind === 'state' && selection.id === s.id,
      })),
    [machine, nodeIssue, simCurrentId, selection],
  );

  const edges: Edge[] = useMemo(
    () =>
      machine.transitions.map((t) => {
        const issue = edgeIssue.get(t.id);
        const classes = [
          issue ? `issue-${issue}` : '',
          simActiveTransitionId === t.id ? 'sim-active' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const guard = String(t.guard ?? '').trim();
        const event = String(t.event ?? '').trim();
        return {
          id: t.id,
          source: t.from,
          target: t.to,
          type: t.from === t.to ? 'selfloop' : 'default',
          label: event ? (guard ? `${event}  [${guard}]` : event) : '（未命名事件）',
          className: classes || undefined,
          selected: selection?.kind === 'transition' && selection.id === t.id,
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
        };
      }),
    [machine, edgeIssue, simActiveTransitionId, selection],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removed: string[] = [];
      let moved: Machine | null = null;
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          if (!moved) moved = cloneMachine(machine);
          const s = moved.states.find((st) => st.id === change.id);
          if (s) {
            s.x = change.position.x;
            s.y = change.position.y;
          }
        } else if (change.type === 'remove') {
          removed.push(change.id);
        } else if (change.type === 'select') {
          if (change.selected) {
            onSelect({ kind: 'state', id: change.id });
          } else {
            onSelect((prev) =>
              prev?.kind === 'state' && prev.id === change.id ? null : prev,
            );
          }
        }
      }
      if (removed.length) {
        onCommit(removeStates(machine, removed));
        onSelect((prev) =>
          prev?.kind === 'state' && removed.includes(prev.id) ? null : prev,
        );
      } else if (moved) {
        onLiveChange(moved);
      }
    },
    [machine, onCommit, onLiveChange, onSelect],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removed: string[] = [];
      for (const change of changes) {
        if (change.type === 'remove') {
          removed.push(change.id);
        } else if (change.type === 'select') {
          if (change.selected) {
            onSelect({ kind: 'transition', id: change.id });
          } else {
            onSelect((prev) =>
              prev?.kind === 'transition' && prev.id === change.id ? null : prev,
            );
          }
        }
      }
      if (removed.length) {
        onCommit(removeTransitions(machine, removed));
        onSelect((prev) =>
          prev?.kind === 'transition' && removed.includes(prev.id) ? null : prev,
        );
      }
    },
    [machine, onCommit, onSelect],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      onCommit(addTransition(machine, conn.source, conn.target));
    },
    [machine, onCommit],
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      onCommit(addState(machine, { x: pos.x - 84, y: pos.y - 26 }));
    },
    [machine, onCommit, rf],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDragStart={onDragStart}
      onNodeDragStop={onDragEnd}
      onPaneClick={() => onSelect(null)}
      onInit={onInit}
      onDoubleClick={onDoubleClick}
      deleteKeyCode={['Delete', 'Backspace']}
      zoomOnDoubleClick={false}
      minZoom={0.2}
      maxZoom={2.5}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={18} />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        className="minimap"
        nodeColor="#cbd5e1"
        nodeStrokeColor="#64748b"
        maskColor="rgba(240, 245, 250, 0.7)"
      />
    </ReactFlow>
  );
}

export type { StateNodeType };
