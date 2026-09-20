import { useCallback, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import Toolbar from './components/Toolbar';
import IssueList from './components/IssueList';
import Inspector from './components/Inspector';
import FlowCanvas from './components/FlowCanvas';
import DebugPanel from './components/DebugPanel';
import { useEditorStore } from './store/useEditorStore';
import { useDebugStore } from './store/useDebugStore';

interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

export default function App() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const showToast = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    const id = ++toastId.current;
    setToasts((list) => [...list, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  // 首次加载：优先恢复本地保存，否则载入示例
  useEffect(() => {
    const store = useEditorStore.getState();
    if (!store.loadFromStorage()) {
      store.loadSample();
    }
  }, []);

  // 撤销/重做快捷键
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (!(e.ctrlKey || e.metaKey)) return;
      if (useEditorStore.getState().debugLocked) return;
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (inField) return;
        if (e.shiftKey) useEditorStore.getState().redo();
        else useEditorStore.getState().undo();
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        if (inField) return;
        useEditorStore.getState().redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // 退出页面时如果有未保存修改，自动保存到本地
  useEffect(() => {
    const save = () => {
      const store = useEditorStore.getState();
      if (store.present.nodes.length > 0 && store.meta.dirty) {
        store.saveToStorage();
      }
    };
    window.addEventListener('beforeunload', save);
    return () => window.removeEventListener('beforeunload', save);
  }, []);

  // 防抖自动保存（每 1.5 秒）
  useEffect(() => {
    const timer = window.setInterval(() => {
      const store = useEditorStore.getState();
      if (store.present.nodes.length > 0 && store.meta.dirty) {
        store.saveToStorage();
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);

  // 调试停止时解锁编辑（进入停止原因终态时保持会话，但允许退出；这里不自动退出）
  const debugActive = useDebugStore((s) => s.active);
  const setDebugLocked = useEditorStore((s) => s.setDebugLocked);
  useEffect(() => {
    if (!debugActive) setDebugLocked(false);
  }, [debugActive, setDebugLocked]);

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <Toolbar onShowToast={showToast} />
        <main className="app-main">
          <IssueList />
          <div className="canvas-area">
            <FlowCanvas />
          </div>
          <Inspector />
        </main>
        <DebugPanel />
        <div className="toast-layer">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.kind}`}>
              {toast.message}
            </div>
          ))}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
