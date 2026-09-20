import { useState } from 'react';
import type { Machine, SimState, SimStep } from '../model/types';
import { getState } from '../model/machine';

export interface DebugPanelProps {
  machine: Machine;
  sim: SimState | null;
  playing: boolean;
  initialEventsText?: string;
  onStart: (context: Record<string, unknown>, events: string[]) => void;
  onForward: () => void;
  onBack: () => void;
  onTogglePlay: () => void;
  onStop: () => void;
  onFocusStep: (step: SimStep) => void;
}

export function DebugPanel({
  machine,
  sim,
  playing,
  initialEventsText = '',
  onStart,
  onForward,
  onBack,
  onTogglePlay,
  onStop,
  onFocusStep,
}: DebugPanelProps) {
  const [contextText, setContextText] = useState(() =>
    JSON.stringify(machine.context ?? {}, null, 2),
  );
  const [eventsText, setEventsText] = useState(initialEventsText);
  const [parseError, setParseError] = useState<string | null>(null);

  const start = () => {
    let context: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(contextText || '{}');
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setParseError('上下文必须是一个 JSON 对象。');
        return;
      }
      context = parsed as Record<string, unknown>;
    } catch (e) {
      setParseError(`上下文 JSON 解析失败：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const events = eventsText
      .split(/[,，;；、\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (events.length === 0) {
      setParseError('请至少输入一个事件。');
      return;
    }
    setParseError(null);
    onStart(context, events);
  };

  const currentState = sim ? getState(machine, sim.currentStateId) : null;

  return (
    <div className="debug-panel">
      <label className="field">
        <span className="field-label">上下文数据（JSON，守卫表达式可引用其中的字段）</span>
        <textarea
          rows={5}
          value={contextText}
          onChange={(e) => setContextText(e.target.value)}
          spellCheck={false}
        />
      </label>
      <label className="field">
        <span className="field-label">事件序列（用逗号或换行分隔）</span>
        <textarea
          rows={2}
          value={eventsText}
          placeholder="例如：提交, 审核, 下单, 支付"
          onChange={(e) => setEventsText(e.target.value)}
        />
      </label>
      {parseError && <p className="field-error">{parseError}</p>}
      <div className="debug-controls">
        <button className="btn btn-primary" onClick={start}>
          {sim ? '重新开始' : '开始调试'}
        </button>
        {sim && (
          <>
            <button className="btn" onClick={onBack} disabled={sim.steps.length === 0}>
              ◀ 回退
            </button>
            <button className="btn" onClick={onForward} disabled={sim.finished}>
              前进 ▶
            </button>
            <button className="btn" onClick={onTogglePlay} disabled={sim.finished}>
              {playing ? '暂停' : '播放'}
            </button>
            <button className="btn" onClick={onStop}>
              结束
            </button>
          </>
        )}
      </div>
      {sim && (
        <div className="sim-status">
          <span>
            当前状态：<strong>{currentState?.name ?? '（无）'}</strong>
          </span>
          <span>
            进度：{Math.min(sim.cursor, sim.events.length)} / {sim.events.length}
          </span>
          {sim.failed && <span className="sim-failed">已停止：存在失败或非确定性</span>}
          {!sim.failed && sim.finished && <span className="sim-done">全部事件执行完毕</span>}
        </div>
      )}
      {sim && sim.steps.length > 0 && (
        <ol className="step-list">
          {sim.steps.map((step, i) => (
            <li key={i}>
              <button className={`step-item step-${step.status}`} onClick={() => onFocusStep(step)}>
                <span className="step-title">
                  {step.status === 'ok' ? '✓' : step.status === 'ambiguous' ? '⚠' : '✗'} {step.title}
                </span>
                {step.details.length > 0 && (
                  <ul className="step-details">
                    {step.details.map((d, j) => (
                      <li key={j}>{d}</li>
                    ))}
                  </ul>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
