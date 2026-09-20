import { useCallback, useEffect, useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useKeyPress,
  useReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { analyzeMachine } from '../lib/analyzer';
import { useEditorStore, useFocusStore } from '../store/useEditorStore';
import { useDebugStore } from '../store/useDebugStore';
import StateNodeView from './StateNodeView';
import TransitionEdgeView from './TransitionEdgeView';
import type { StateNode, TransitionEdge } from '../types';

type DecoratedNode = StateNode & {
  data: StateNode['data'] & {
    issues?: number;
    hasError?: boolean;
    hasWarning?: boolean;
    reachable?: boolean;
    active?: boolean;
    dimmed?: boolean;
  };
};

type DecoratedEdge = import('@xyflow/react').Edge<TransitionEdge['data'], 'transition'> & {
  hasError?: boolean;
  hasWarning?: boolean;
  active?: boolean;
};

const nodeTypes: NodeTypes = { state: StateNodeView };

export default function FlowCanvas() {
  const machine = useEditorStore((s) => s.present);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const selectedEdgeId = useEditorStore((s) => s.selectedEdgeId);
  const applyNodeChangesRF = useEditorStore((s) => s.applyNodeChangesRF);
  const applyEdgeChangesRF = useEditorStore((s) => s.applyEdgeChangesRF);
  const addConnection = useEditorStore((s) => s.addConnection);
  const addNodeAt = useEditorStore((s) => s.addNodeAt);
  const selectNode = useEditorStore((s) => s.selectNode);
  const selectEdge = useEditorStore((s) => s.selectEdge);
  const deleteSelection = useEditorStore((s) => s.deleteSelection);
  const debugLocked = useEditorStore((s) => s.debugLocked);
  const focusTarget = useFocusStore((s) => s.focusTarget);

  const { screenToFlowPosition, setCenter, getNode, getEdge, fitView, setViewport } = useReactFlow();

  const analysis = useMemo(() => analyzeMachine(machine), [machine]);

  const debugActive = useDebugStore((s) => s.active);
  const debugSteps = useDebugStore((s) => s.steps);
  const debugStepIndex = useDebugStore((s) => s.stepIndex);
  const currentStep = debugSteps[debugStepIndex];

  const deletePressed = useKeyPress(['Backspace', 'Delete']);
  useEffect(() => {
    if (deletePressed && !debugLocked) {
      deleteSelection();
    }
  }, [deletePressed, deleteSelection, debugLocked]);

  const decoratedNodes = useMemo<DecoratedNode[]>(() => {
    return machine.nodes.map((node) => {
      const nodeIssues = analysis.nodeIssueMap.get(node.id) ?? [];
      const hasError = nodeIssues.some((i) => i.severity === 'error');
      const hasWarning = !hasError && nodeIssues.some((i) => i.severity === 'warning');
      return {
        ...node,
        selected: node.id === selectedNodeId,
        data: {
          ...node.data,
          issues: nodeIssues.length,
          hasError,
          hasWarning,
          reachable: analysis.reachable.has(node.id),
          active: debugActive && currentStep?.stateAfter === node.id,
          dimmed: debugActive && currentStep?.stateAfter !== node.id,
        },
      };
    });
  }, [machine.nodes, analysis, selectedNodeId, debugActive, currentStep]);

  const decoratedEdges = useMemo<DecoratedEdge[]>(() => {
    return machine.edges.map((edge) => {
      const edgeIssues = analysis.edgeIssueMap.get(edge.id) ?? [];
      const hasError = edgeIssues.some((i) => i.severity === 'error');
      const hasWarning = !hasError && edgeIssues.some((i) => i.severity === 'warning');
      return {
        ...edge,
        selected: edge.id === selectedEdgeId,
        data: {
          ...edge.data,
          hasError,
          hasWarning,
          active: debugActive && currentStep?.takenEdgeId === edge.id,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 18,
          height: 18,
          color:
            debugActive && currentStep?.takenEdgeId === edge.id
              ? '#22c55e'
              : hasError
                ? '#ef4444'
                : hasWarning
                  ? '#f59e0b'
                  : '#64748b',
        },
      };
    });
  }, [machine.edges, analysis, selectedEdgeId, debugActive, currentStep]);

  const edgeTypes = useMemo(
    () => ({
      transition: (
        props: Parameters<typeof TransitionEdgeView>[0] & {
          hasError?: boolean;
          hasWarning?: boolean;
          active?: boolean;
        },
      ) => <TransitionEdgeView {...props} onLabelClick={(id) => selectEdge(id)} />,
    }),
    [selectEdge],
  );

  const onPaneDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (debugLocked) return;
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      addNodeAt({ x: position.x - 90, y: position.y - 36 });
    },
    [screenToFlowPosition, addNodeAt, debugLocked],
  );

  // 问题列表点击：定位并选中对应状态/转换
  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget.kind === 'node') {
      const node = getNode(focusTarget.id);
      if (node) {
        selectNode(focusTarget.id);
        const x = node.position.x + (node.measured?.width ?? 180) / 2;
        const y = node.position.y + (node.measured?.height ?? 72) / 2;
        setCenter(x, y, { zoom: 1.1, duration: 400 });
      }
    } else {
      const edge = getEdge(focusTarget.id);
      if (edge) {
        selectEdge(focusTarget.id);
        const source = getNode(edge.source);
        const target = getNode(edge.target);
        if (source && target) {
          const cx =
            (source.position.x +
              (source.measured?.width ?? 180) / 2 +
              target.position.x +
              (target.measured?.width ?? 180) / 2) /
            2;
          const cy =
            (source.position.y +
              (source.measured?.height ?? 72) / 2 +
              target.position.y +
              (target.measured?.height ?? 72) / 2) /
            2;
          setCenter(cx, cy, { zoom: 1.1, duration: 400 });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget?.nonce]);

  // 调试步进后跟随当前状态
  useEffect(() => {
    if (!debugActive || !currentStep?.stateAfter) return;
    const node = getNode(currentStep.stateAfter);
    if (node) {
      const x = node.position.x + (node.measured?.width ?? 180) / 2;
      const y = node.position.y + (node.measured?.height ?? 72) / 2;
      setCenter(x, y, { zoom: 1.05, duration: 300 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugStepIndex]);

  const minimapNodeColor = useCallback(
    (node: DecoratedNode) => {
      const list = analysis.nodeIssueMap.get(node.id) ?? [];
      if (list.some((i) => i.severity === 'error')) return '#fecaca';
      if (list.some((i) => i.severity === 'warning')) return '#fde68a';
      if (node.data.initial) return '#bfdbfe';
      if (node.data.final) return '#bbf7d0';
      return '#e2e8f0';
    },
    [analysis],
  );

  return (
    <div className="canvas-wrap">
      <ReactFlow<DecoratedNode, DecoratedEdge>
        nodes={decoratedNodes}
        edges={decoratedEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={(changes) => applyNodeChangesRF(changes as never)}
        onEdgesChange={(changes) => applyEdgeChangesRF(changes as never)}
        onConnect={addConnection}
        onNodeClick={(_, node) => selectNode(node.id)}
        onEdgeClick={(_, edge) => selectEdge(edge.id)}
        onPaneClick={() => {
          selectNode(null);
          selectEdge(null);
        }}
        onDoubleClick={onPaneDoubleClick}
        nodesDraggable={!debugLocked}
        nodesConnectable={!debugLocked}
        elementsSelectable
        deleteKeyCode={null}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={{ type: 'transition' }}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={minimapNodeColor}
          nodeStrokeWidth={2}
          pannable
          zoomable
          className="flow-minimap"
        />
      </ReactFlow>
      <div className="canvas-hint">
        {debugLocked ? '调试模式：编辑已锁定' : '双击空白处创建状态 · 拖拽节点边缘的圆点连线 · Delete 删除选中'}
      </div>
      <button
        type="button"
        className="fit-view-btn"
        onClick={() => {
          fitView({ padding: 0.15, duration: 300 });
        }}
        title="缩放到全图"
      >
        ⤢ 全图
      </button>
      <button
        type="button"
        className="reset-view-btn"
        onClick={() => setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 300 })}
        title="重置视图"
      >
        ⌂ 100%
      </button>
    </div>
  );
}
