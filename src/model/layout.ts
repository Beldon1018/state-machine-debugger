import dagre from '@dagrejs/dagre';
import type { Machine } from './types';

export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 52;

/** 使用 dagre 分层布局，返回 { stateId: {x, y} }（节点左上角坐标）。 */
export function autoLayout(machine: Machine): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 56, ranksep: 130, marginx: 40, marginy: 40 });

  for (const s of machine.states) {
    g.setNode(s.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const t of machine.transitions) {
    if (t.from === t.to) continue;
    if (machine.states.some((s) => s.id === t.from) && machine.states.some((s) => s.id === t.to)) {
      g.setEdge(t.from, t.to);
    }
  }
  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const s of machine.states) {
    const node = g.node(s.id);
    if (node) {
      positions[s.id] = { x: node.x - NODE_WIDTH / 2, y: node.y - NODE_HEIGHT / 2 };
    }
  }
  return positions;
}
