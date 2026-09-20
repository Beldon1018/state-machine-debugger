import { getState, initialState } from './machine';
import { evalGuard } from './guard';
import type { Machine, SimState, SimStep } from './types';

function clonePlain(obj: unknown): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(obj ?? {})) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function summarizeContext(ctx: Record<string, unknown>): string {
  const keys = Object.keys(ctx ?? {});
  if (!keys.length) return '空';
  const shown = keys.slice(0, 6).map((k) => `${k}=${JSON.stringify(ctx[k])}`);
  return shown.join(', ') + (keys.length > 6 ? ', …' : '');
}

/** 创建模拟会话。只读取 machine，绝不修改它。 */
export function createSimulation(
  machine: Machine,
  events: string[],
  contextOverride?: Record<string, unknown>,
): SimState {
  const init = initialState(machine);
  return {
    events: events.slice(),
    cursor: 0,
    currentStateId: init ? init.id : null,
    context: { ...clonePlain(machine.context), ...(contextOverride ?? {}) },
    steps: [],
    finished: false,
    failed: false,
  };
}

/**
 * 推进一步，返回新的 SimState（不可变更新，原始 machine 不受影响）。
 * 命中多条转换时停止并标记 ambiguous，绝不随机选择。
 */
export function simStepForward(machine: Machine, sim: SimState): SimState {
  if (sim.finished) return sim;

  if (!sim.currentStateId) {
    const step: SimStep = {
      index: -1,
      event: null,
      status: 'fail',
      fromId: null,
      toId: null,
      transitionId: null,
      title: '状态机没有初始状态，模拟无法开始。',
      details: [],
    };
    return { ...sim, finished: true, failed: true, steps: [...sim.steps, step] };
  }
  if (sim.cursor >= sim.events.length) return { ...sim, finished: true };

  const event = sim.events[sim.cursor];
  const fromState = getState(machine, sim.currentStateId);
  const fromName = fromState?.name ?? '?';
  const candidates = machine.transitions.filter(
    (t) => t.from === sim.currentStateId && String(t.event ?? '').trim() === event,
  );

  const step: SimStep = {
    index: sim.cursor,
    event,
    status: 'fail',
    fromId: sim.currentStateId,
    toId: null,
    transitionId: null,
    title: '',
    details: [],
  };

  if (candidates.length === 0) {
    const available = machine.transitions
      .filter((t) => t.from === sim.currentStateId)
      .map((t) => String(t.event ?? '').trim())
      .filter(Boolean);
    step.title = `事件「${event}」在状态「${fromName}」下没有对应的转换。`;
    step.details.push(
      available.length
        ? `当前状态只接受这些事件：${available.join('、')}。`
        : '当前状态没有任何出向转换（死胡同）。',
    );
    return {
      ...sim,
      cursor: sim.cursor + 1,
      failed: true,
      finished: true,
      steps: [...sim.steps, step],
    };
  }

  const matched: string[] = [];
  for (const t of candidates) {
    const result = evalGuard(t.guard, sim.context);
    const toState = getState(machine, t.to);
    const label = `→「${toState?.name ?? '?'}」`;
    if (result.error) {
      step.details.push(`${label}：守卫「${t.guard}」求值出错（${result.error}），视为不满足。`);
    } else if (String(t.guard ?? '').trim()) {
      step.details.push(
        `${label}：守卫「${t.guard}」求值为 ${result.value}（上下文：${summarizeContext(sim.context)}）。`,
      );
    } else {
      step.details.push(`${label}：无守卫条件，直接匹配。`);
    }
    if (!result.error && result.value) matched.push(t.id);
  }

  if (matched.length === 0) {
    step.title = `事件「${event}」在状态「${fromName}」下有 ${candidates.length} 条候选转换，但所有守卫条件都不满足。`;
    return {
      ...sim,
      cursor: sim.cursor + 1,
      failed: true,
      finished: true,
      steps: [...sim.steps, step],
    };
  }

  if (matched.length > 1) {
    step.status = 'ambiguous';
    const names = matched
      .map((id) => {
        const t = machine.transitions.find((tr) => tr.id === id)!;
        const s = getState(machine, t.to);
        return `「${s?.name ?? '?'}」`;
      })
      .join('、');
    step.title = `事件「${event}」同时满足 ${matched.length} 条转换（目标：${names}），存在非确定性，模拟停止。请为转换添加互斥的守卫条件后再试。`;
    return {
      ...sim,
      cursor: sim.cursor + 1,
      failed: true,
      finished: true,
      steps: [...sim.steps, step],
    };
  }

  const chosen = machine.transitions.find((t) => t.id === matched[0])!;
  const toState = getState(machine, chosen.to);
  step.status = 'ok';
  step.transitionId = chosen.id;
  step.toId = chosen.to;
  step.title = `事件「${event}」：「${fromName}」→「${toState?.name ?? '?'}」。`;

  const cursor = sim.cursor + 1;
  return {
    ...sim,
    cursor,
    currentStateId: chosen.to,
    finished: cursor >= sim.events.length,
    steps: [...sim.steps, step],
  };
}

/** 回退一步：弹出最后一条记录，状态回到该步的 fromId。 */
export function simStepBack(sim: SimState): SimState {
  if (sim.steps.length === 0) return sim;
  const steps = sim.steps.slice(0, -1);
  const last = sim.steps[sim.steps.length - 1];
  const currentStateId =
    last.index === -1 ? sim.currentStateId : last.fromId;
  return {
    ...sim,
    steps,
    currentStateId,
    cursor: Math.max(0, sim.cursor - 1),
    finished: false,
    failed: false,
  };
}
