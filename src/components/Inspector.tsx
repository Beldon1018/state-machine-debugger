import type { Machine } from '../model/types';
import {
  getState,
  getTransition,
  removeStates,
  removeTransitions,
  updateState,
  updateTransition,
} from '../model/machine';
import { validateGuard } from '../model/guard';
import type { Selection } from './FlowCanvas';

export interface InspectorProps {
  machine: Machine;
  selection: Selection;
  onLiveChange: (next: Machine) => void;
  onCommit: (next: Machine) => void;
  beginTransient: () => void;
  endTransient: () => void;
  onSelect: (sel: Selection) => void;
}

function TextField(props: {
  label: string;
  value: string;
  placeholder?: string;
  error?: string | null;
  onLive: (v: string) => void;
  beginTransient: () => void;
  endTransient: () => void;
}) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      <input
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        className={props.error ? 'input-error' : ''}
        onFocus={props.beginTransient}
        onBlur={props.endTransient}
        onChange={(e) => props.onLive(e.target.value)}
      />
      {props.error && <span className="field-error">{props.error}</span>}
    </label>
  );
}

export function Inspector({
  machine,
  selection,
  onLiveChange,
  onCommit,
  beginTransient,
  endTransient,
  onSelect,
}: InspectorProps) {
  if (selection?.kind === 'state') {
    const state = getState(machine, selection.id);
    if (!state) return <EmptyHint text="所选状态已删除。" />;
    return (
      <div className="inspector">
        <h3>状态</h3>
        <TextField
          label="名称"
          value={state.name}
          onLive={(v) => onLiveChange(updateState(machine, state.id, { name: v }))}
          beginTransient={beginTransient}
          endTransient={endTransient}
        />
        <label className="field field-inline">
          <input
            type="checkbox"
            checked={state.initial}
            onChange={(e) => onCommit(updateState(machine, state.id, { initial: e.target.checked }))}
          />
          <span>初始状态（全局唯一）</span>
        </label>
        <label className="field field-inline">
          <input
            type="checkbox"
            checked={state.final}
            onChange={(e) => onCommit(updateState(machine, state.id, { final: e.target.checked }))}
          />
          <span>终态（正常结束，不算死胡同）</span>
        </label>
        <button
          className="btn btn-danger"
          onClick={() => {
            onCommit(removeStates(machine, [state.id]));
            onSelect(null);
          }}
        >
          删除状态及其相连转换
        </button>
      </div>
    );
  }

  if (selection?.kind === 'transition') {
    const t = getTransition(machine, selection.id);
    if (!t) return <EmptyHint text="所选转换已删除。" />;
    const from = getState(machine, t.from);
    const to = getState(machine, t.to);
    const guardError = validateGuard(t.guard);
    return (
      <div className="inspector">
        <h3>转换</h3>
        <p className="muted">
          {from?.name ?? '?'} → {to?.name ?? '?'}
        </p>
        <TextField
          label="事件名"
          value={t.event}
          placeholder="例如：提交、支付、取消"
          onLive={(v) => onLiveChange(updateTransition(machine, t.id, { event: v }))}
          beginTransient={beginTransient}
          endTransient={endTransient}
        />
        <TextField
          label="守卫条件（JS 表达式，可使用上下文字段）"
          value={t.guard}
          placeholder="例如：score >= 60 && amount < 10000"
          error={guardError ? `语法错误：${guardError}` : null}
          onLive={(v) => onLiveChange(updateTransition(machine, t.id, { guard: v }))}
          beginTransient={beginTransient}
          endTransient={endTransient}
        />
        <button
          className="btn btn-danger"
          onClick={() => {
            onCommit(removeTransitions(machine, [t.id]));
            onSelect(null);
          }}
        >
          删除转换
        </button>
      </div>
    );
  }

  return (
    <div className="inspector">
      <h3>状态机</h3>
      <TextField
        label="流程名称"
        value={machine.name}
        onLive={(v) => onLiveChange({ ...machine, name: v })}
        beginTransient={beginTransient}
        endTransient={endTransient}
      />
      <p className="muted">
        双击画布空白处新建状态；从状态边缘拖出连线创建转换；选中后按 Delete 删除。
      </p>
      <p className="muted">
        共 {machine.states.length} 个状态、{machine.transitions.length} 条转换。
      </p>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="inspector">
      <p className="muted">{text}</p>
    </div>
  );
}
