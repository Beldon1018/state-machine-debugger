import type { Machine, SerializedMachine, StateNode, TransitionEdge } from '../types';

export function genId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function emptyMachine(): Machine {
  return { nodes: [], edges: [] };
}

export function serializeMachine(machine: Machine): SerializedMachine {
  return {
    version: 1,
    nodes: machine.nodes.map((n) => ({
      id: n.id,
      label: n.data.label,
      initial: n.data.initial,
      final: n.data.final,
      position: { x: n.position.x, y: n.position.y },
    })),
    edges: machine.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      event: e.data!.event,
      guard: e.data!.guard,
    })),
  };
}

export function deserializeMachine(data: unknown): Machine {
  if (!data || typeof data !== 'object') throw new Error('JSON 顶层必须是对象');
  const obj = data as Partial<SerializedMachine>;
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) {
    throw new Error('JSON 必须包含 nodes 和 edges 数组');
  }
  const seenIds = new Set<string>();
  const nodes: StateNode[] = obj.nodes.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('nodes 中存在非法项');
    const n = raw as SerializedMachine['nodes'][number];
    if (typeof n.id !== 'string' || !n.id) throw new Error('状态缺少 id');
    if (seenIds.has(n.id)) throw new Error(`状态 id 重复：${n.id}`);
    seenIds.add(n.id);
    const position =
      n.position && typeof n.position.x === 'number' && typeof n.position.y === 'number'
        ? { x: n.position.x, y: n.position.y }
        : { x: 0, y: 0 };
    return {
      id: n.id,
      type: 'state',
      position,
      data: {
        label: String(n.label ?? ''),
        initial: Boolean(n.initial),
        final: Boolean(n.final),
      },
    };
  });

  const edges: TransitionEdge[] = obj.edges.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('edges 中存在非法项');
    const e = raw as SerializedMachine['edges'][number];
    if (typeof e.id !== 'string' || !e.id) throw new Error('转换缺少 id');
    if (seenIds.has(e.id)) throw new Error(`转换 id 重复：${e.id}`);
    seenIds.add(e.id);
    if (!e.source || !e.target) throw new Error(`转换 ${e.id} 缺少 source/target`);
    return {
      id: e.id,
      type: 'transition',
      source: String(e.source),
      target: String(e.target),
      data: {
        event: String(e.event ?? ''),
        guard: String(e.guard ?? ''),
      },
    };
  });

  for (const edge of edges) {
    if (!seenIds.has(edge.source)) throw new Error(`转换 ${edge.id} 的 source 不存在：${edge.source}`);
    if (!seenIds.has(edge.target)) throw new Error(`转换 ${edge.id} 的 target 不存在：${edge.target}`);
  }

  return { nodes, edges };
}

export function downloadJson(machine: Machine, filename = 'state-machine.json') {
  const blob = new Blob([JSON.stringify(serializeMachine(machine), null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function nodeLabel(machine: Machine, id: string | null): string {
  if (!id) return '—';
  const node = machine.nodes.find((n) => n.id === id);
  return node ? node.data!.label || '(未命名)' : `(已删除 ${id})`;
}
