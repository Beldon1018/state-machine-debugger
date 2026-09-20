import { applyEdgeChanges, applyNodeChanges, type Connection } from '@xyflow/react';
import { create } from 'zustand';
import {
  deserializeMachine,
  genId,
  serializeMachine,
} from '../lib/machine';
import { autoLayout } from '../lib/layout';
import { createSampleMachine } from '../lib/sample';
import type {
  Machine,
  StateNode,
  TransitionEdge,
} from '../types';

const STORAGE_KEY = 'state-machine-debugger:v1';
const HISTORY_LIMIT = 100;

interface MachineMeta {
  savedAt: string | null;
  dirty: boolean;
}

interface EditorStore {
  past: Machine[];
  present: Machine;
  future: Machine[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  meta: MachineMeta;
  debugLocked: boolean;

  canUndo: () => boolean;
  canRedo: () => boolean;
  commit: (next: Machine, markDirty?: boolean) => void;
  replaceAll: (next: Machine, markDirty?: boolean) => void;

  undo: () => void;
  redo: () => void;

  applyNodeChangesRF: (changes: import('@xyflow/react').NodeChange<StateNode>[]) => void;
  applyEdgeChangesRF: (changes: import('@xyflow/react').EdgeChange<TransitionEdge>[]) => void;
  addConnection: (connection: Connection) => void;
  addNodeAt: (position: { x: number; y: number }) => void;
  beginEdit: () => void;
  endEdit: () => void;
  editNode: (id: string, patch: Partial<StateNode['data']>) => void;
  editEdge: (id: string, patch: Partial<TransitionEdge['data']>) => void;
  deleteNode: (id: string) => void;
  deleteEdge: (id: string) => void;
  deleteSelection: () => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  runAutoLayout: () => void;
  loadSample: () => void;
  clearAll: () => void;

  setDebugLocked: (locked: boolean) => void;

  saveToStorage: () => string;
  loadFromStorage: () => boolean;
}

function clone(machine: Machine): Machine {
  return structuredClone(machine);
}

let dragSnapshot: Machine | null = null;
let editSnapshot: Machine | null = null;

function withDeleted(machine: Machine, nodeIds: Set<string>, edgeIds: Set<string>): Machine {
  return {
    nodes: machine.nodes.filter((n) => !nodeIds.has(n.id)),
    edges: machine.edges.filter(
      (e) =>
        !edgeIds.has(e.id) &&
        !nodeIds.has(e.source) &&
        !nodeIds.has(e.target),
    ),
  };
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  past: [],
  present: { nodes: [], edges: [] },
  future: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  meta: { savedAt: null, dirty: false },
  debugLocked: false,

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  commit: (next, markDirty = true) => {
    editSnapshot = null;
    const { present, past } = get();
    set({
      past: [...past.slice(-(HISTORY_LIMIT - 1)), clone(present)],
      present: next,
      future: [],
      meta: markDirty ? { ...get().meta, dirty: true } : get().meta,
    });
  },

  replaceAll: (next, markDirty = false) => {
    set({
      past: [],
      present: next,
      future: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      meta: { ...get().meta, dirty: markDirty },
    });
  },

  undo: () => {
    const { past, present, future } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      present: previous,
      future: [clone(present), ...future].slice(0, HISTORY_LIMIT),
      selectedNodeId: null,
      selectedEdgeId: null,
      meta: { ...get().meta, dirty: true },
    });
  },

  redo: () => {
    const { past, present, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({
      past: [...past, clone(present)].slice(-HISTORY_LIMIT),
      present: next,
      future: future.slice(1),
      selectedNodeId: null,
      selectedEdgeId: null,
      meta: { ...get().meta, dirty: true },
    });
  },

  applyNodeChangesRF: (changes) => {
    if (get().debugLocked) return;
    const current = get().present;
    const updatedNodes = applyNodeChanges(changes, current.nodes);
    const hasRemoval = changes.some((c) => c.type === 'remove');
    if (hasRemoval) {
      const removed = new Set(
        changes.filter((c) => c.type === 'remove').map((c) => c.id),
      );
      dragSnapshot = null;
      const next = {
        nodes: updatedNodes,
        edges: current.edges.filter((e) => !removed.has(e.source) && !removed.has(e.target)),
      };
      get().commit(next);
      if (get().selectedNodeId && removed.has(get().selectedNodeId!)) {
        set({ selectedNodeId: null });
      }
      return;
    }

    const startedDragging = changes.some((c) => c.type === 'position' && c.dragging === true);
    const endedDragging = changes.some((c) => c.type === 'position' && c.dragging === false);
    if (startedDragging && !dragSnapshot) {
      dragSnapshot = clone(current);
    }

    const next: Machine = { nodes: updatedNodes, edges: current.edges };
    if (endedDragging && dragSnapshot) {
      const before = dragSnapshot;
      dragSnapshot = null;
      set({
        past: [...get().past.slice(-(HISTORY_LIMIT - 1)), before],
        present: next,
        future: [],
        meta: { ...get().meta, dirty: true },
      });
      return;
    }
    set({ present: next });
  },

  applyEdgeChangesRF: (changes) => {
    if (get().debugLocked) return;
    const current = get().present;
    const updatedEdges = applyEdgeChanges(changes, current.edges as never) as unknown as TransitionEdge[];
    const hasRemoval = changes.some((c) => c.type === 'remove');
    if (hasRemoval) {
      get().commit({ nodes: current.nodes, edges: updatedEdges });
      const removed = new Set(
        changes.filter((c) => c.type === 'remove').map((c) => c.id),
      );
      if (get().selectedEdgeId && removed.has(get().selectedEdgeId!)) {
        set({ selectedEdgeId: null });
      }
      return;
    }
    set({ present: { nodes: current.nodes, edges: updatedEdges } });
  },

  addConnection: (connection) => {
    if (get().debugLocked) return;
    if (!connection.source || !connection.target) return;
    const data: TransitionEdge['data'] = { event: '', guard: '' };
    const edge: TransitionEdge = {
      id: genId('e'),
      type: 'transition',
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
      data,
    };
    const next = {
      nodes: get().present.nodes,
      edges: [...get().present.edges, edge],
    };
    get().commit(next);
    set({ selectedEdgeId: edge.id, selectedNodeId: null });
  },

  addNodeAt: (position) => {
    if (get().debugLocked) return;
    const node: StateNode = {
      id: genId('s'),
      type: 'state',
      position,
      data: {
        label: `新状态 ${get().present.nodes.length + 1}`,
        initial: false,
        final: false,
      },
    };
    get().commit({ nodes: [...get().present.nodes, node], edges: get().present.edges });
    set({ selectedNodeId: node.id, selectedEdgeId: null });
  },

  beginEdit: () => {
    if (!editSnapshot) editSnapshot = clone(get().present);
  },

  endEdit: () => {
    if (!editSnapshot) return;
    const before = editSnapshot;
    editSnapshot = null;
    const changed = JSON.stringify(before) !== JSON.stringify(get().present);
    const top = get().past[get().past.length - 1];
    if (changed && JSON.stringify(top) !== JSON.stringify(before)) {
      set({
        past: [...get().past.slice(-(HISTORY_LIMIT - 1)), before],
        future: [],
        meta: { ...get().meta, dirty: true },
      });
    }
  },

  editNode: (id: string, patch: Partial<StateNode['data']>) => {
    const nodes = get().present.nodes.map((n): StateNode => {
      if (n.id !== id) return n;
      const data: StateNode['data'] = {
        label: patch.label ?? n.data.label,
        initial: patch.initial ?? n.data.initial,
        final: patch.final ?? n.data.final,
      };
      return { ...n, data };
    });
    set({ present: { nodes, edges: get().present.edges }, meta: { ...get().meta, dirty: true } });
  },

  editEdge: (id: string, patch: Partial<TransitionEdge['data']>) => {
    const edges = get().present.edges.map((e): TransitionEdge => {
      if (e.id !== id) return e;
      const data: TransitionEdge['data'] = {
        event: patch.event !== undefined ? patch.event : e.data.event,
        guard: patch.guard !== undefined ? patch.guard : e.data.guard,
      };
      return { ...e, data };
    });
    set({ present: { nodes: get().present.nodes, edges }, meta: { ...get().meta, dirty: true } });
  },

  deleteNode: (id) => {
    if (get().debugLocked) return;
    get().commit(withDeleted(get().present, new Set([id]), new Set()));
    if (get().selectedNodeId === id) set({ selectedNodeId: null });
  },

  deleteEdge: (id) => {
    if (get().debugLocked) return;
    get().commit({
      nodes: get().present.nodes,
      edges: get().present.edges.filter((e) => e.id !== id),
    });
    if (get().selectedEdgeId === id) set({ selectedEdgeId: null });
  },

  deleteSelection: () => {
    if (get().debugLocked) return;
    const { selectedNodeId, selectedEdgeId } = get();
    if (!selectedNodeId && !selectedEdgeId) return;
    get().commit(
      withDeleted(
        get().present,
        new Set(selectedNodeId ? [selectedNodeId] : []),
        new Set(selectedEdgeId ? [selectedEdgeId] : []),
      ),
    );
    set({ selectedNodeId: null, selectedEdgeId: null });
  },

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  runAutoLayout: () => {
    if (get().debugLocked) return;
    get().commit(autoLayout(get().present));
  },

  loadSample: () => {
    get().replaceAll(createSampleMachine());
  },

  clearAll: () => {
    get().replaceAll({ nodes: [], edges: [] });
  },

  setDebugLocked: (locked) => set({ debugLocked: locked }),

  saveToStorage: () => {
    const payload = {
      machine: serializeMachine(get().present),
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    set({ meta: { savedAt: payload.savedAt, dirty: false } });
    return payload.savedAt;
  },

  loadFromStorage: () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as { machine: unknown; savedAt?: string };
      const machine = deserializeMachine(parsed.machine);
      get().replaceAll(machine);
      set({ meta: { savedAt: parsed.savedAt ?? null, dirty: false } });
      return true;
    } catch (e) {
      console.error('加载本地保存失败', e);
      return false;
    }
  },
}));

export { STORAGE_KEY };

interface FocusTarget {
  kind: 'node' | 'edge';
  id: string;
  nonce: number;
}

export interface EditorFocusApi {
  focusTarget: FocusTarget | null;
  requestFocus: (kind: 'node' | 'edge', id: string) => void;
}

export const useFocusStore = create<EditorFocusApi>((set) => ({
  focusTarget: null,
  requestFocus: (kind, id) =>
    set({ focusTarget: { kind, id, nonce: Date.now() } }),
}));
