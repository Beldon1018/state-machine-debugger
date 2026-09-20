import { useRef } from 'react';
import { downloadJson, deserializeMachine } from '../lib/machine';
import { useEditorStore } from '../store/useEditorStore';

interface ToolbarProps {
  onShowToast: (message: string, kind?: 'info' | 'error') => void;
}

export default function Toolbar({ onShowToast }: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const runAutoLayout = useEditorStore((s) => s.runAutoLayout);
  const loadSample = useEditorStore((s) => s.loadSample);
  const clearAll = useEditorStore((s) => s.clearAll);
  const saveToStorage = useEditorStore((s) => s.saveToStorage);
  const loadFromStorage = useEditorStore((s) => s.loadFromStorage);
  const debugLocked = useEditorStore((s) => s.debugLocked);
  const savedAt = useEditorStore((s) => s.meta.savedAt);
  const dirty = useEditorStore((s) => s.meta.dirty);

  const handleExport = () => {
    const machine = useEditorStore.getState().present;
    if (machine.nodes.length === 0) {
      onShowToast('画布为空，没有可导出的内容', 'error');
      return;
    }
    downloadJson(machine);
    onShowToast('已导出 JSON 文件');
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const machine = deserializeMachine(parsed);
      useEditorStore.getState().replaceAll(machine, true);
      onShowToast(`导入成功：${machine.nodes.length} 个状态，${machine.edges.length} 条转换`);
    } catch (e) {
      onShowToast(`导入失败：${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  };

  return (
    <header className="app-toolbar">
      <div className="brand">
        <span className="brand-icon">🔀</span>
        <div className="brand-text">
          <strong>状态机编辑与调试工具</strong>
          <span className="brand-sub">可视化 · 静态检查 · 逐步调试</span>
        </div>
      </div>

      <div className="toolbar-groups">
        <div className="toolbar-group">
          <button type="button" className="tool-btn" onClick={undo} disabled={!canUndo || debugLocked} title="撤销 (Ctrl+Z)">
            ↶ 撤销
          </button>
          <button type="button" className="tool-btn" onClick={redo} disabled={!canRedo || debugLocked} title="重做 (Ctrl+Shift+Z)">
            ↷ 重做
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button type="button" className="tool-btn" onClick={runAutoLayout} disabled={debugLocked}>
            ✨ 自动布局
          </button>
          <button type="button" className="tool-btn" onClick={() => addStateCenter()} disabled={debugLocked}>
            ＋ 新状态
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button type="button" className="tool-btn" onClick={handleExport}>
            ⬇ 导出 JSON
          </button>
          <button type="button" className="tool-btn" onClick={() => fileRef.current?.click()}>
            ⬆ 导入 JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            }}
          />
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            type="button"
            className="tool-btn"
            onClick={() => {
              const at = saveToStorage();
              onShowToast(`已保存到浏览器本地（${new Date(at).toLocaleString()}）`);
            }}
          >
            💾 本地保存
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={() => {
              if (loadFromStorage()) onShowToast('已从本地恢复');
              else onShowToast('本地还没有保存记录', 'error');
            }}
          >
            📂 读取本地
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <button
            type="button"
            className="tool-btn"
            onClick={() => {
              if (window.confirm('载入示例会替换当前画布（可用撤销恢复），继续？')) loadSample();
            }}
          >
            🧪 载入示例
          </button>
          <button
            type="button"
            className="tool-btn"
            onClick={() => {
              if (window.confirm('确定清空整个画布？（可用撤销恢复）')) clearAll();
            }}
            disabled={debugLocked}
          >
            🗑 清空
          </button>
        </div>
      </div>

      <div className="save-state" title={savedAt ? `上次保存：${new Date(savedAt).toLocaleString()}` : '尚未保存'}>
        {savedAt ? (
          dirty ? (
            <span className="save-dirty">● 有未保存修改</span>
          ) : (
            <span className="save-ok">已保存 {new Date(savedAt).toLocaleTimeString()}</span>
          )
        ) : (
          <span className="save-none">未保存</span>
        )}
      </div>
    </header>
  );
}

function addStateCenter() {
  useEditorStore.getState().addNodeAt({
    x: 200 + Math.random() * 200,
    y: 160 + Math.random() * 120,
  });
}
