import { getState } from './machine';
import { validateGuard } from './guard';
import type { Issue, Machine, FSMTransition } from './types';

function transitionLabel(t: FSMTransition): string {
  const ev = String(t.event ?? '').trim() || '（无事件）';
  return `「${ev}」`;
}

/**
 * 静态分析：找出不可达状态、死胡同、初始状态配置错误、
 * 非确定性转换、悬空转换、空事件、守卫语法错误。
 */
export function analyzeMachine(machine: Machine): Issue[] {
  const issues: Issue[] = [];
  const { states, transitions } = machine;
  if (states.length === 0) return issues;

  const initials = states.filter((s) => s.initial);
  if (initials.length === 0) {
    issues.push({
      type: 'no-initial',
      severity: 'error',
      message: '没有初始状态：请将一个状态标记为“初始”，否则流程无法启动。',
    });
  } else if (initials.length > 1) {
    issues.push({
      type: 'multiple-initial',
      severity: 'error',
      message: `存在 ${initials.length} 个初始状态（${initials
        .map((s) => `「${s.name}」`)
        .join('、')}）：初始状态必须唯一。`,
      stateId: initials[0].id,
    });
  }

  for (const t of transitions) {
    if (!getState(machine, t.from) || !getState(machine, t.to)) {
      issues.push({
        type: 'dangling',
        severity: 'error',
        message: `转换 ${transitionLabel(t)} 引用了不存在的状态。`,
        transitionIds: [t.id],
      });
    }
    if (!String(t.event ?? '').trim()) {
      issues.push({
        type: 'empty-event',
        severity: 'warning',
        message: `转换 ${transitionLabel(t)} 没有设置事件名，永远不会被事件触发。`,
        transitionIds: [t.id],
      });
    }
    const guardError = validateGuard(t.guard);
    if (guardError) {
      issues.push({
        type: 'guard-syntax',
        severity: 'error',
        message: `转换 ${transitionLabel(t)} 的守卫表达式语法错误：${guardError}`,
        transitionIds: [t.id],
      });
    }
  }

  // 不可达状态（忽略守卫，只要图上连通即视为可达）
  const adjacency = new Map<string, string[]>();
  for (const t of transitions) {
    if (!adjacency.has(t.from)) adjacency.set(t.from, []);
    adjacency.get(t.from)!.push(t.to);
  }
  const reachable = new Set<string>();
  const queue = initials.length ? initials.map((s) => s.id) : [];
  queue.forEach((id) => reachable.add(id));
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of adjacency.get(cur) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  for (const s of states) {
    if (!reachable.has(s.id)) {
      issues.push({
        type: 'unreachable',
        severity: 'error',
        message: `状态「${s.name}」不可达：从初始状态出发没有任何转换路径能到达它。`,
        stateId: s.id,
      });
    }
  }

  // 死胡同：没有出边且不是终态
  for (const s of states) {
    const outgoing = transitions.filter((t) => t.from === s.id);
    if (outgoing.length === 0 && !s.final) {
      issues.push({
        type: 'dead-end',
        severity: 'warning',
        message: `状态「${s.name}」是死胡同：没有任何出向转换，进入后事件将无路可走（如属正常结束，请标记为“终态”）。`,
        stateId: s.id,
      });
    }
  }

  // 非确定性：同一源状态、同一事件的多条转换
  const groups = new Map<string, FSMTransition[]>();
  for (const t of transitions) {
    const key = `${t.from}|${String(t.event ?? '').trim()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const fromState = getState(machine, list[0].from);
    const eventName = String(list[0].event ?? '').trim() || '（空事件）';
    const reported = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const pairKey = [a.id, b.id].sort().join('|');
        if (reported.has(pairKey)) continue;
        reported.add(pairKey);
        const ga = String(a.guard ?? '').trim();
        const gb = String(b.guard ?? '').trim();
        const toA = getState(machine, a.to);
        const toB = getState(machine, b.to);
        const desc = `「${fromState?.name ?? '?'}」在事件「${eventName}」下`;
        if (!ga || !gb || ga === gb) {
          const reason =
            !ga && !gb
              ? '两条转换都没有守卫条件'
              : !ga || !gb
                ? '其中一条没有守卫条件，恒为真'
                : '两条转换的守卫条件完全相同';
          issues.push({
            type: 'nondeterminism',
            severity: 'error',
            message: `${desc}存在必然冲突的转换（→「${toA?.name ?? '?'}」与 →「${toB?.name ?? '?'}」）：${reason}。`,
            stateId: list[0].from,
            transitionIds: [a.id, b.id],
          });
        } else {
          issues.push({
            type: 'nondeterminism',
            severity: 'warning',
            message: `${desc}存在可能冲突的转换（→「${toA?.name ?? '?'}」守卫「${ga}」与 →「${toB?.name ?? '?'}」守卫「${gb}」）：两个守卫可能同时为真，请确认它们互斥。`,
            stateId: list[0].from,
            transitionIds: [a.id, b.id],
          });
        }
      }
    }
  }

  return issues;
}
