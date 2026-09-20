import { useMemo } from 'react';
import { useEditorStore, useFocusStore } from '../store/useEditorStore';
import { analyzeMachine, issueTypeLabel } from '../lib/analyzer';

const severityIcon = { error: '⛔', warning: '⚠️' } as const;

export default function IssueList() {
  const machine = useEditorStore((s) => s.present);
  const requestFocus = useFocusStore((s) => s.requestFocus);
  const analysis = useMemo(() => analyzeMachine(machine), [machine]);

  const errors = analysis.issues.filter((i) => i.severity === 'error');
  const warnings = analysis.issues.filter((i) => i.severity === 'warning');
  const sorted = useMemo(
    () => [...analysis.issues].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'error' ? -1 : 1;
      return a.type.localeCompare(b.type);
    }),
    [analysis],
  );

  return (
    <aside className="side-panel issue-panel">
      <div className="panel-header">
        <span>问题列表</span>
        <span className="issue-counts">
          <span className="count-error">{errors.length} 错误</span>
          <span className="count-warning">{warnings.length} 警告</span>
        </span>
      </div>
      <div className="panel-body">
        {sorted.length === 0 ? (
          <div className="issue-empty">
            <div className="issue-empty-icon">✅</div>
            <div>未发现结构问题</div>
            <div className="issue-empty-sub">不可达、死胡同、初始配置与非确定性检查均已通过</div>
          </div>
        ) : (
          <ul className="issue-list">
            {sorted.map((issue) => (
              <li key={issue.id}>
                <button
                  type="button"
                  className={`issue-item issue-${issue.severity}`}
                  onClick={() => {
                    if (issue.nodeId) requestFocus('node', issue.nodeId);
                    else if (issue.edgeIds?.length) requestFocus('edge', issue.edgeIds[0]);
                  }}
                >
                  <span className="issue-item-icon">{severityIcon[issue.severity]}</span>
                  <span className="issue-item-content">
                    <span className="issue-item-type">{issueTypeLabel(issue.type)}</span>
                    <span className="issue-item-message">{issue.message}</span>
                    {issue.detail && <span className="issue-item-detail">{issue.detail}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
