import { uid } from './machine';
import type { FSMState, FSMTransition, Machine } from './types';

export function serializeMachine(machine: Machine): string {
  return JSON.stringify(machine, null, 2);
}

/** 解析并校验导入的 JSON，字段缺失时补默认值。不合法时抛出带中文信息的 Error。 */
export function parseMachine(json: string): Machine {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('不是合法的 JSON 文本。');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('JSON 顶层必须是一个对象。');
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.states) || !Array.isArray(obj.transitions)) {
    throw new Error('JSON 必须包含 states 和 transitions 两个数组。');
  }

  const states: FSMState[] = obj.states.map((s, i) => {
    const st = (s ?? {}) as Record<string, unknown>;
    return {
      id: typeof st.id === 'string' && st.id ? st.id : uid('s'),
      name: typeof st.name === 'string' && st.name ? st.name : `状态${i + 1}`,
      x: typeof st.x === 'number' ? st.x : 120 + (i % 5) * 200,
      y: typeof st.y === 'number' ? st.y : 120 + Math.floor(i / 5) * 120,
      initial: st.initial === true,
      final: st.final === true,
    };
  });
  const stateIds = new Set(states.map((s) => s.id));

  const transitions: FSMTransition[] = (obj.transitions as unknown[]).map((t) => {
    const tr = (t ?? {}) as Record<string, unknown>;
    return {
      id: typeof tr.id === 'string' && tr.id ? tr.id : uid('t'),
      from: typeof tr.from === 'string' ? tr.from : '',
      to: typeof tr.to === 'string' ? tr.to : '',
      event: typeof tr.event === 'string' ? tr.event : '',
      guard: typeof tr.guard === 'string' ? tr.guard : '',
    };
  });
  for (const t of transitions) {
    if (!stateIds.has(t.from) || !stateIds.has(t.to)) {
      throw new Error(`转换「${t.event || t.id}」引用了不存在的状态，请检查 from/to 字段。`);
    }
  }

  const context =
    typeof obj.context === 'object' && obj.context !== null && !Array.isArray(obj.context)
      ? (obj.context as Record<string, unknown>)
      : {};

  return {
    name: typeof obj.name === 'string' && obj.name ? obj.name : '导入的状态机',
    context,
    states,
    transitions,
  };
}

const STORAGE_KEY = 'fsm-debugger-machine-v1';

export function saveToLocal(machine: Machine): void {
  localStorage.setItem(STORAGE_KEY, serializeMachine(machine));
}

export function loadFromLocal(): Machine | null {
  const text = localStorage.getItem(STORAGE_KEY);
  if (!text) return null;
  try {
    return parseMachine(text);
  } catch {
    return null;
  }
}
