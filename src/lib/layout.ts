import dagre from 'dagre';
import type { Machine, StateNode, TransitionEdge } from '../types';

export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 72;

export function autoLayout(machine: Machine, direction: 'LR' | 'TB' = 'LR'): Machine {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: direction,
    nodesep: 40,
    ranksep: 90,
    marginx: 24,
    marginy: 24,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const node of machine.nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of machine.edges) {
    if (machine.nodes.some((n) => n.id === edge.source) &&
        machine.nodes.some((n) => n.id === edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  }

  dagre.layout(graph);

  const nodes: StateNode[] = machine.nodes.map((node) => {
    const positioned = graph.node(node.id);
    if (!positioned) return node;
    return {
      ...node,
      position: {
        x: positioned.x - NODE_WIDTH / 2,
        y: positioned.y - NODE_HEIGHT / 2,
      },
    };
  });

  const edges: TransitionEdge[] = machine.edges.map((edge) => ({ ...edge }));
  return { nodes, edges };
}
