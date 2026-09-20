import type { Issue } from '../model/types';

export interface IssuesPanelProps {
  issues: Issue[];
  onFocus: (issue: Issue) => void;
}

const TYPE_LABEL: Record<Issue['type'], string> = {
  'no-initial': '初始状态',
  'multiple-initial': '初始状态',
  unreachable: '不可达',
  'dead-end': '死胡同',
  nondeterminism: '非确定性',
  'guard-syntax': '守卫语法',
  'empty-event': '空事件',
  dangling: '悬空转换',
};

export function IssuesPanel({ issues, onFocus }: IssuesPanelProps) {
  if (issues.length === 0) {
    return (
      <div className="issues-panel">
        <p className="issues-empty">✓ 未发现问题</p>
      </div>
    );
  }
  return (
    <div className="issues-panel">
      <ul className="issue-list">
        {issues.map((issue, i) => (
          <li key={i}>
            <button className={`issue-item issue-${issue.severity}`} onClick={() => onFocus(issue)}>
              <span className="issue-tag">
                {issue.severity === 'error' ? '错误' : '警告'} · {TYPE_LABEL[issue.type]}
              </span>
              <span className="issue-message">{issue.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
