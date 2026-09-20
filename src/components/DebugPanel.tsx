import { useMemo, useState } from 'react';
import { canGoForward, useDebugStore } from '../store/useDebugStore';
import { useEditorStore } from '../store/useEditorStore';
import { nodeLabel } from '../lib/machine';
import { formatValue } from '../lib/eval';
import { SAMPLE_CONTEXT, SAMPLE_EVENTS } from '../lib/sample';
import type { Machine, TraceStep } from '../types';

export default function DebugPanel() {
  const machine = useEditorStore((s) => s.present);
  const setDebugLocked = useEditorStore((s) => s.setDebugLocked);

  const debug = useDebugStore();
  const [contextText, setContextText] = useState(SAMPLE_CONTEXT);
  const [eventsText, setEventsText] = useState(SAMPLE_EVENTS);
  const [inputError, setInputError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const parsedContext = useMemo(() => {
    try {
      const text = contextText.trim();
      return { value: text ? JSON.parse(text) : {}, error: null as string | null };
    } catch (e) {
      return { value: {}, error: e instanceof Error ? e.message : String(e) };
    }
  }, [contextText]);

  const eventList = useMemo(
    () =>
      eventsText
        .split(/[\n,，;；]/)
        .map((s) => s.trim())
        .filter(Boolean),
    [eventsText],
  );

  const startDebug = () => {
    if (parsedContext.error) {
      setInputError(`上下文 JSON 解析失败：${parsedContext.error}`);
      return;
    }
    if (eventList.length === 0) {
      setInputError('请至少输入一个事件');
      return;
    }
    setInputError(null);
    const result = debug.start(machine, parsedContext.value, eventList);
    if (result.error) {
      setInputError(result.error);
      return;
    }
    setDebugLocked(true);
  };

  const stopDebug = () => {
    debug.stop();
    setDebugLocked(false);
  };

  const current = debug.steps[debug.stepIndex];
  const goForward = canGoForward(debug.steps, debug.stepIndex);

  return (
    <section className={`debug-panel ${collapsed ? 'is-collapsed' : ''}`}>
      <header className="debug-header">
        <div className="debug-title">
          <span className="debug-dot" data-active={debug.active} />
          调试器
        </div>
        <div className="debug-toolbar">
          {!debug.active ? (
            <button type="button" className="primary-btn" onClick={startDebug}>
              ▶ 开始调试（锁定编辑）
            </button>
          ) : (
            <>
              <button type="button" className="ghost-btn" onClick={debug.back} disabled={debug.stepIndex <= 0}>
                ⏮ 回退
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={debug.forward}
                disabled={!goForward}
                title={!goForward ? '当前已停止或没有可执行步骤' : '执行下一个事件'}
              >
                前进 ⏭
              </button>
              <button type="button" className="ghost-btn" onClick={debug.restart}>
                ↺ 重新开始
              </button>
              <button type="button" className="danger-btn ghost-danger" onClick={stopDebug}>
                ⏹ 退出调试
              </button>
            </>
          )}
          <button type="button" className="ghost-btn" onClick={() => setCollapsed((v) => !v)}>
            {collapsed ? '展开 ▲' : '收起 ▼'}
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="debug-body">
          <div className="debug-inputs">
            <label className="debug-field">
              <span className="field-label">
                上下文数据（JSON）
                {parsedContext.error && <em className="field-error">{parsedContext.error}</em>}
              </span>
              <textarea
                className="debug-textarea"
                rows={7}
                spellCheck={false}
                value={contextText}
                disabled={debug.active}
                onChange={(e) => setContextText(e.target.value)}
              />
            </label>
            <label className="debug-field">
              <span className="field-label">
                事件序列（每行一个，共 {eventList.length} 个）
              </span>
              <textarea
                className="debug-textarea"
                rows={7}
                spellCheck={false}
                value={eventsText}
                disabled={debug.active}
                onChange={(e) => setEventsText(e.target.value)}
              />
            </label>
          </div>

          <div className="debug-trace-wrap">
            {inputError && <div className="debug-input-error">{inputError}</div>}
            {!debug.active ? (
              <div className="debug-placeholder">
                <p>配置好上下文与事件后点击“开始调试”。</p>
                <p>调试期间画布编辑会被锁定，所有执行基于开始时的快照，原始流程不会被修改。</p>
                <p>
                  当事件无可用转换、同时命中多条转换或守卫报错时，调试器会立即停止并解释原因，
                  <strong>不会随机选择</strong>。
                </p>
              </div>
            ) : (
              <ol className="trace-list">
                {debug.steps.map((step, index) => (
                  <TraceItem
                    key={`${step.index}-${index}`}
                    step={step}
                    machine={machine}
                    active={index === debug.stepIndex}
                    passed={index < debug.stepIndex}
                  />
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {collapsed && debug.active && current && (
        <div className="debug-collapsed-summary">
          {current.eventName ? `事件 ${current.eventIndex! + 1}/${eventList.length}：${current.eventName}` : '初始化'}
          {' → '}
          {nodeLabel(machine, current.stateAfter)}
        </div>
      )}
    </section>
  );
}

const outcomeStyles: Record<string, { tag: string; cls: string }> = {
  init: { tag: '初始化', cls: 'init' },
  transitioned: { tag: '转换成功', cls: 'success' },
  'no-transition': { tag: '无可用转换 · 已停止', cls: 'stop' },
  ambiguous: { tag: '命中多条转换 · 已停止', cls: 'stop' },
  'guard-error': { tag: '守卫执行错误 · 已停止', cls: 'stop' },
  'final-state': { tag: '结束状态 · 已停止', cls: 'stop' },
  completed: { tag: '执行完成', cls: 'success' },
};

function TraceItem({
  step,
  machine,
  active,
  passed,
}: {
  step: TraceStep;
  machine: Machine;
  active: boolean;
  passed: boolean;
}) {
  const style = outcomeStyles[step.outcome] ?? { tag: step.outcome, cls: 'init' };
  return (
    <li className={`trace-item trace-${style.cls} ${active ? 'is-active' : ''} ${passed ? 'is-passed' : ''}`}>
      <div className="trace-item-head">
        <span className={`trace-tag trace-tag-${style.cls}`}>{style.tag}</span>
        {step.eventName ? (
          <span className="trace-event">事件 #{step.eventIndex! + 1}：<code>{step.eventName}</code></span>
        ) : (
          <span className="trace-event">初始化</span>
        )}
        <span className="trace-states">
          <code className="state-before">{nodeLabel(machine, step.stateBefore)}</code>
          <span className="trace-arrow">→</span>
          <code className="state-after">{nodeLabel(machine, step.stateAfter)}</code>
        </span>
      </div>
      <p className="trace-reason">{step.reason}</p>
      {step.candidates.length > 0 && (
        <table className="trace-candidates">
          <thead>
            <tr>
              <th>候选转换</th>
              <th>守卫</th>
              <th>结果</th>
            </tr>
          </thead>
          <tbody>
            {step.candidates.map((candidate) => {
              const isTaken = step.takenEdgeId === candidate.edgeId;
              let resultCell: React.ReactNode;
              if (!candidate.result.ok) {
                resultCell = <span className="guard-result guard-error-result">错误：{candidate.result.error}</span>;
              } else if (!candidate.guard.trim()) {
                resultCell = <span className="guard-result guard-pass">无守卫，恒为 true</span>;
              } else if (candidate.result.value) {
                resultCell = (
                  <span className="guard-result guard-pass">
                    true<em className="guard-value">（求值 {formatValue(candidate.result.raw)}）</em>
                  </span>
                );
              } else {
                resultCell = <span className="guard-result guard-fail">false</span>;
              }
              return (
                <tr key={candidate.edgeId} className={isTaken ? 'candidate-taken' : ''}>
                  <td>
                    {nodeLabel(machine, candidate.from)} <span className="arrow">→</span>{' '}
                    {nodeLabel(machine, candidate.to)}
                    {isTaken && <span className="taken-badge">已选择</span>}
                  </td>
                  <td>
                    <code>{candidate.guard.trim() || '—'}</code>
                  </td>
                  <td>{resultCell}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </li>
  );
}


