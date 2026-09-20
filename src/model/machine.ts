import type { FSMState, FSMTransition, Machine } from './types';

let idCounter = 0;

export function uid(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function createEmptyMachine(): Machine {
  return { name: '未命名状态机', context: {}, states: [], transitions: [] };
}

export function cloneMachine(machine: Machine): Machine {
  return JSON.parse(JSON.stringify(machine)) as Machine;
}

export function getState(machine: Machine, id: string | null | undefined): FSMState | null {
  if (!id) return null;
  return machine.states.find((s) => s.id === id) ?? null;
}

export function getTransition(machine: Machine, id: string | null | undefined): FSMTransition | null {
  if (!id) return null;
  return machine.transitions.find((t) => t.id === id) ?? null;
}

export function initialState(machine: Machine): FSMState | null {
  return machine.states.find((s) => s.initial) ?? null;
}

export function addState(machine: Machine, partial?: Partial<FSMState>): Machine {
  const next = cloneMachine(machine);
  const state: FSMState = {
    id: uid('s'),
    name: `状态${next.states.length + 1}`,
    x: 120,
    y: 120,
    initial: false,
    final: false,
    ...partial,
  };
  if (state.initial) next.states.forEach((s) => (s.initial = false));
  next.states.push(state);
  if (next.states.length === 1) state.initial = true;
  return next;
}

export function updateState(machine: Machine, id: string, patch: Partial<FSMState>): Machine {
  const next = cloneMachine(machine);
  const state = next.states.find((s) => s.id === id);
  if (!state) return machine;
  Object.assign(state, patch);
  if (patch.initial) next.states.forEach((s) => (s.initial = s.id === id));
  return next;
}

export function removeStates(machine: Machine, ids: string[]): Machine {
  const removed = new Set(ids);
  const next = cloneMachine(machine);
  next.states = next.states.filter((s) => !removed.has(s.id));
  next.transitions = next.transitions.filter((t) => !removed.has(t.from) && !removed.has(t.to));
  return next;
}

export function addTransition(machine: Machine, from: string, to: string): Machine {
  const next = cloneMachine(machine);
  next.transitions.push({ id: uid('t'), from, to, event: '', guard: '' });
  return next;
}

export function updateTransition(machine: Machine, id: string, patch: Partial<FSMTransition>): Machine {
  const next = cloneMachine(machine);
  const t = next.transitions.find((tr) => tr.id === id);
  if (!t) return machine;
  Object.assign(t, patch);
  return next;
}

export function removeTransitions(machine: Machine, ids: string[]): Machine {
  const removed = new Set(ids);
  const next = cloneMachine(machine);
  next.transitions = next.transitions.filter((t) => !removed.has(t.id));
  return next;
}
