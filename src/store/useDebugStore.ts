import { create } from 'zustand';
import type { Machine, TraceStep } from '../types';
import { findInitial, makeInitStep, runEventStep, type Context } from '../lib/interpreter';

interface DebugStartResult {
  error?: string;
}

interface DebugStore {
  active: boolean;
  snapshot: Machine | null;
  context: Context;
  events: string[];
  steps: TraceStep[];
  stepIndex: number;
  startError: string | null;

  start: (machine: Machine, context: unknown, events: string[]) => DebugStartResult;
  stop: () => void;
  forward: () => void;
  back: () => void;
  restart: () => void;
}

const initialState = {
  active: false,
  snapshot: null,
  context: {} as Context,
  events: [],
  steps: [] as TraceStep[],
  stepIndex: -1,
  startError: null as string | null,
};

export const useDebugStore = create<DebugStore>((set, get) => ({
  ...initialState,

  start: (machine, context, events) => {
    if (machine.nodes.length === 0) {
      return { error: '画布为空，没有可调试的状态机' };
    }
    const { state: initial, error } = findInitial(machine);
    if (!initial || error) {
      return { error: error ?? '初始状态无效' };
    }
    const snapshot = structuredClone(machine);
    const ctx = (context ?? {}) as Context;
    const steps = [makeInitStep(snapshot, initial, events.length)];
    set({
      active: true,
      snapshot,
      context: ctx,
      events: [...events],
      steps,
      stepIndex: 0,
      startError: null,
    });
    return {};
  },

  stop: () => set({ ...initialState }),

  forward: () => {
    let { active, steps, stepIndex, events, snapshot, context } = get();
    if (!active || !snapshot) return;
    const current = steps[stepIndex];
    if (!current) return;
    if (current.stopped || current.stateAfter === null) return;
    // 回退后再前进：丢弃被回退的后续步骤，保证执行线性一致
    steps = steps.slice(0, stepIndex + 1);
    stepIndex = steps.length - 1;
    const eventIndex = current.eventIndex === null ? 0 : current.eventIndex + 1;
    if (eventIndex >= events.length) {
      // 所有事件已消费：若当前在结束状态则正常完成，否则提示无更多事件
      const isFinal = snapshot.nodes.find((n) => n.id === current.stateAfter)?.data.final;
      const finalStep: TraceStep = {
        index: steps.length,
        eventIndex: null,
        eventName: null,
        stateBefore: current.stateAfter,
        stateAfter: current.stateAfter,
        candidates: [],
        takenEdgeId: null,
        outcome: isFinal ? 'completed' : 'no-transition',
        reason: isFinal
          ? `全部 ${events.length} 个事件执行完毕，当前位于结束状态，执行正常完成`
          : `全部 ${events.length} 个事件已处理完，但当前状态 "${
              snapshot.nodes.find((n) => n.id === current.stateAfter)?.data.label ?? ''
            }" 不是结束状态`,
        stopped: true,
        remainingEvents: 0,
      };
      set({ steps: [...steps, finalStep], stepIndex: steps.length });
      return;
    }
    const step = runEventStep({
      machine: snapshot,
      currentState: current.stateAfter,
      eventName: events[eventIndex],
      eventIndex,
      remainingEvents: events.length - eventIndex - 1,
      stepIndex: steps.length,
      context,
    });
    set({ steps: [...steps, step], stepIndex: steps.length });
  },

  back: () => {
    const { stepIndex } = get();
    if (stepIndex <= 0) return;
    set({ stepIndex: stepIndex - 1 });
  },

  restart: () => {
    const { snapshot } = get();
    if (!snapshot) return;
    const { state: initial } = findInitial(snapshot);
    if (!initial) return;
    const events = get().events;
    const init = makeInitStep(snapshot, initial, events.length);
    set({ steps: [init], stepIndex: 0 });
  },
}));

export function canGoForward(steps: TraceStep[], stepIndex: number): boolean {
  const current = steps[stepIndex];
  if (!current || current.stopped || current.stateAfter === null) return false;
  return true;
}
