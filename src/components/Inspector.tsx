import { analyzeMachine, issueTypeLabel } from '../lib/analyzer';
import { nodeLabel } from '../lib/machine';
import { useEditorStore } from '../store/useEditorStore';
import { useMemo } from 'react';

export default function Inspector() {
  const machine = useEditorStore((s) => s.present);
  const selectedNodeId = useEditorStore((s) => s.selectedNodeId);
  const selectedEdgeId = useEditorStore((s) => s.selectedEdgeId);
  const beginEdit = useEditorStore((s) => s.beginEdit);
  const endEdit = useEditorStore((s) => s.endEdit);
  const editNode = useEditorStore((s) => s.editNode);
  const editEdge = useEditorStore((s) => s.editEdge);
  const deleteNode = useEditorStore((s) => s.deleteNode);
  const deleteEdge = useEditorStore((s) => s.deleteEdge);
  const debugLocked = useEditorStore((s) => s.debugLocked);

  const analysis = useMemo(() => analyzeMachine(machine), [machine]);

  const node = selectedNodeId ? machine.nodes.find((n) => n.id === selectedNodeId) : undefined;
  const edge = selectedEdgeId ? machine.edges.find((e) => e.id === selectedEdgeId) : undefined;

  return (
    <aside className="side-panel inspector-panel">
      <div className="panel-header">
        <span>属性</span>
        {debugLocked && <span className="locked-tag">调试中只读</span>}
      </div>
      <div className="panel-body">
        {node ? (
          <div className="inspector-form">
            <label className="field">
              <span className="field-label">状态名称</span>
              <input
                className="field-input"
                value={node.data!.label}
                disabled={debugLocked}
                onFocusCapture={() => beginEdit()}
                onChange={(e) => editNode(node.id, { label: e.target.value })}
                onBlur={() => endEdit()}
                placeholder="例如：待支付"
              />
            </label>

            <div className="field-row">
              <label className={`checkbox-card ${node.data!.initial ? 'is-checked' : ''}`}>
                <input
                  type="radio"
                  name="initial-flag"
                  checked={node.data!.initial}
                  disabled={debugLocked}
                  onChange={(e) => {
                    if (!e.target.checked) return;
                    const nodes = machine.nodes.map((n) => ({
                      ...n,
                      data: { ...n.data, initial: n.id === node.id },
                    }));
                    useEditorStore.getState().commit({ nodes, edges: machine.edges });
                  }}
                />
                <span>● 初始状态</span>
              </label>
              <label className={`checkbox-card ${node.data!.final ? 'is-checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={node.data!.final}
                  disabled={debugLocked}
                  onChange={(e) => {
                    beginEdit();
                    editNode(node.id, { final: e.target.checked });
                    endEdit();
                  }}
                />
                <span>■ 结束状态</span>
              </label>
            </div>

            <div className="field field-static">
              <span className="field-label">标识 ID</span>
              <code className="field-code">{node.id}</code>
            </div>

            <NodeRelatedInfo nodeId={node.id} />

            <button
              type="button"
              className="danger-btn"
              disabled={debugLocked}
              onClick={() => deleteNode(node.id)}
            >
              删除状态（同时删除关联转换）
            </button>

            <IssueHints
              items={(analysis.nodeIssueMap.get(node.id) ?? []).map((i) => ({
                severity: i.severity,
                title: issueTypeLabel(i.type),
                message: i.message,
              }))}
            />
          </div>
        ) : edge ? (
          <div className="inspector-form">
            <div className="edge-route">
              <span>{nodeLabel(machine, edge.source)}</span>
              <span className="arrow">→</span>
              <span>{nodeLabel(machine, edge.target)}</span>
            </div>
            <label className="field">
              <span className="field-label">事件名称</span>
              <input
                className="field-input"
                value={edge.data!!.event}
                disabled={debugLocked}
                onFocusCapture={() => beginEdit()}
                onChange={(e) => editEdge(edge.id, { event: e.target.value })}
                onBlur={() => endEdit()}
                placeholder="例如：PAY"
              />
            </label>
            <label className="field">
              <span className="field-label">守卫条件（可选）</span>
              <textarea
                className="field-input field-textarea"
                value={edge.data!!.guard}
                disabled={debugLocked}
                rows={3}
                onFocusCapture={() => beginEdit()}
                onChange={(e) => editEdge(edge.id, { guard: e.target.value })}
                onBlur={() => endEdit()}
                placeholder="例如：paidAmount >= amount && vip === true"
              />
            </label>
            <div className="guard-help">
              可用：<code>x.y</code>、<code>arr[0]</code>、<code>==</code>/<code>===</code>、
              <code>&amp;&amp;</code>、<code>||</code>、<code>!x</code>、三元表达式、
              <code>length(x)</code>、<code>min/max/abs/round</code>、<code>includes(a, b)</code>
            </div>
            <div className="field field-static">
              <span className="field-label">标识 ID</span>
              <code className="field-code">{edge.id}</code>
            </div>
            <button
              type="button"
              className="danger-btn"
              disabled={debugLocked}
              onClick={() => deleteEdge(edge.id)}
            >
              删除转换
            </button>
            <IssueHints
              items={(analysis.edgeIssueMap.get(edge.id) ?? []).map((i) => ({
                severity: i.severity,
                title: issueTypeLabel(i.type),
                message: i.message,
              }))}
            />
          </div>
        ) : (
          <div className="inspector-empty">
            <div>未选中任何元素</div>
            <div className="inspector-empty-sub">
              点击画布中的状态或转换进行编辑；双击空白处可新建状态。
            </div>
            <div className="inspector-stats">
              <div>状态数：{machine.nodes.length}</div>
              <div>转换数：{machine.edges.length}</div>
              <div>问题数：{analysis.issues.length}</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function NodeRelatedInfo({ nodeId }: { nodeId: string }) {
  const machine = useEditorStore((s) => s.present);
  const incoming = machine.edges.filter((e) => e.target === nodeId);
  const outgoing = machine.edges.filter((e) => e.source === nodeId);
  return (
    <div className="related-info">
      <div>入边 {incoming.length} · 出边 {outgoing.length}</div>
      {outgoing.length > 0 && (
        <div className="related-events">
          出向事件：{outgoing.map((e) => e.data!.event || '(空)').join('、')}
        </div>
      )}
    </div>
  );
}

function IssueHints({
  items,
}: {
  items: Array<{ severity: 'error' | 'warning'; title: string; message: string }>;
}) {
  if (items.length === 0) {
    return <div className="issue-hints issue-hints-ok">该元素没有关联的问题</div>;
  }
  return (
    <div className="issue-hints">
      {items.map((item, idx) => (
        <div key={idx} className={`issue-hint issue-hint-${item.severity}`}>
          <strong>{item.title}</strong>
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
