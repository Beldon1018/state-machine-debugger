export interface ToolbarProps {
  machineName: string;
  canUndo: boolean;
  canRedo: boolean;
  errorCount: number;
  warningCount: number;
  onAddState: () => void;
  onAutoLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onFitView: () => void;
  onLoadSample: () => void;
  onImport: () => void;
  onExport: () => void;
  onSaveLocal: () => void;
  onLoadLocal: () => void;
  onClear: () => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <header className="toolbar">
      <span className="app-title">状态机调试器</span>
      <span className="machine-name" title={props.machineName}>
        {props.machineName}
      </span>
      <div className="toolbar-group">
        <button className="btn" onClick={props.onAddState} title="在画布中央新建状态（也可双击画布空白处）">
          ＋ 状态
        </button>
        <button className="btn" onClick={props.onAutoLayout} title="按层次自动排列所有状态">
          自动布局
        </button>
        <button className="btn" onClick={props.onFitView} title="缩放画布以显示全部状态">
          适应视图
        </button>
      </div>
      <div className="toolbar-group">
        <button className="btn" onClick={props.onUndo} disabled={!props.canUndo} title="撤销 (Ctrl+Z)">
          ↶ 撤销
        </button>
        <button className="btn" onClick={props.onRedo} disabled={!props.canRedo} title="重做 (Ctrl+Shift+Z)">
          ↷ 重做
        </button>
      </div>
      <div className="toolbar-group">
        <button className="btn" onClick={props.onLoadSample}>载入示例</button>
        <button className="btn" onClick={props.onImport}>导入 JSON</button>
        <button className="btn" onClick={props.onExport}>导出 JSON</button>
        <button className="btn" onClick={props.onSaveLocal} title="保存到浏览器 localStorage">
          保存到本地
        </button>
        <button className="btn" onClick={props.onLoadLocal} title="从浏览器 localStorage 恢复">
          从本地恢复
        </button>
        <button className="btn btn-danger" onClick={props.onClear}>清空</button>
      </div>
      <span className="issue-summary">
        {props.errorCount > 0 && <span className="summary-error">● {props.errorCount} 错误</span>}
        {props.warningCount > 0 && <span className="summary-warning">● {props.warningCount} 警告</span>}
        {props.errorCount === 0 && props.warningCount === 0 && (
          <span className="summary-ok">✓ 无问题</span>
        )}
      </span>
    </header>
  );
}
