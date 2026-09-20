import type {
  CandidateTransition,
  Machine,
  TraceStep,
  TransitionEdge,
} from '../types';
import { evaluateGuard } from './eval';
import { nodeLabel } from './machine';

export type Context = Record<string, unknown>;

export function findInitial(machine: Machine): { state: string | null; error?: string } {
  const initials = machine.nodes.filter((n) => n.data.initial);
  if (initials.length === 0) return { state: null, error: '没有初始状态，无法开始调试' };
  if (initials.length > 1) {
    return {
      state: null,
      error: `存在 ${initials.length} 个初始状态（${initials.map((n) => n.data.label).join('、')}），请先修正`,
    };
  }
  return { state: initials[0].id };
}

function buildCandidates(
  edges: TransitionEdge[],
  currentState: string,
  eventName: string,
  context: Context,
): CandidateTransition[] {
  return edges
    .filter((e) => e.source === currentState && e.data!.event.trim() === eventName.trim())
    .map((edge) => {
      const guardExpr = edge.data!!.guard.trim();
      if (!guardExpr) {
        return {
          edgeId: edge.id,
          from: edge.source,
          to: edge.target,
          event: edge.data!!.event,
          guard: edge.data!!.guard,
          result: { ok: true, value: true },
        };
      }
      const result = evaluateGuard(guardExpr, context);
      return {
        edgeId: edge.id,
        from: edge.source,
        to: edge.target,
        event: edge.data!!.event,
        guard: edge.data!!.guard,
        result: { ok: result.ok, value: result.truthy, raw: result.value, error: result.error },
      };
    });
}

export interface StepInput {
  machine: Machine;
  currentState: string;
  eventName: string;
  eventIndex: number;
  remainingEvents: number;
  stepIndex: number;
  context: Context;
}

export function runEventStep(input: StepInput): TraceStep {
  const { machine, currentState, eventName, eventIndex, remainingEvents, stepIndex, context } = input;
  const currentNode = machine.nodes.find((n) => n.id === currentState);
  const base = {
    index: stepIndex,
    eventIndex,
    eventName,
    stateBefore: currentState,
    remainingEvents,
  };

  // 当前状态已经是结束状态：事件不再处理
  if (currentNode?.data.final) {
    return {
      ...base,
      stateAfter: currentState,
      candidates: [],
      takenEdgeId: null,
      outcome: 'final-state',
      reason: `当前位于结束状态 "${nodeLabel(machine, currentState)}"，事件 "${eventName}" 不再处理，执行停止`,
      stopped: true,
    };
  }

  const candidates = buildCandidates(machine.edges, currentState, eventName, context);

  // 守卫执行错误
  const errored = candidates.filter((c) => !c.result.ok);
  if (errored.length > 0) {
    return {
      ...base,
      stateAfter: currentState,
      candidates,
      takenEdgeId: null,
      outcome: 'guard-error',
      reason: `转换 ${errored.map((c) => c.edgeId).join('、')} 的守卫条件执行出错：${errored[0].result.error}`,
      stopped: true,
    };
  }

  const matched = candidates.filter((c) => c.result.value);

  if (matched.length === 0) {
    const reason =
      candidates.length === 0
        ? `状态 "${nodeLabel(machine, currentState)}" 上没有任何由事件 "${eventName}" 触发的转换`
        : `状态 "${nodeLabel(machine, currentState)}" 上有 ${candidates.length} 条事件 "${eventName}" 的转换，但守卫条件全部不成立`;
    return {
      ...base,
      stateAfter: currentState,
      candidates,
      takenEdgeId: null,
      outcome: 'no-transition',
      reason,
      stopped: true,
    };
  }

  if (matched.length > 1) {
    return {
      ...base,
      stateAfter: currentState,
      candidates,
      takenEdgeId: null,
      outcome: 'ambiguous',
      reason: `事件 "${eventName}" 同时命中 ${matched.length} 条转换（${matched
        .map((c) => `${nodeLabel(machine, c.from)} → ${nodeLabel(machine, c.to)}`)
        .join('；')}），存在非确定性，调试器不会随机选择，执行停止`,
      stopped: true,
    };
  }

  const taken = matched[0];
  return {
    ...base,
    stateAfter: taken.to,
    candidates,
    takenEdgeId: taken.edgeId,
    outcome: 'transitioned',
    reason: taken.guard.trim()
      ? `唯一通过的守卫条件（${taken.guard}）成立，沿转换进入 "${nodeLabel(machine, taken.to)}"`
      : `该事件仅有一条转换且无守卫条件，进入 "${nodeLabel(machine, taken.to)}"`,
    stopped: false,
  };
}

export function makeInitStep(machine: Machine, initialState: string, totalEvents: number): TraceStep {
  return {
    index: 0,
    eventIndex: null,
    eventName: null,
    stateBefore: null,
    stateAfter: initialState,
    candidates: [],
    takenEdgeId: null,
    outcome: 'init',
    reason: `初始化：进入初始状态 "${nodeLabel(machine, initialState)}"，共载入 ${totalEvents} 个事件`,
    stopped: false,
    remainingEvents: totalEvents,
  };
}
