import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import { useMachineHistory } from './hooks/useMachineHistory';
import { analyzeMachine } from './model/analyze';
import { createSimulation, simStepBack, simStepForward } from './model/simulate';
import { autoLayout, NODE_HEIGHT, NODE_WIDTH } from './model/layout';
import { buildSampleMachine, SAMPLE_EVENTS } from './model/sample';
import { addState, createEmptyMachine, cloneMachine } from './model/machine';
import {
  loadFromLocal,
  parseMachine,
  saveToLocal,
  serializeMachine,
} from './model/io';
import type { Issue, SimState, SimStep } from './model/types';
import { FlowCanvas, type Selection, type SelectionUpdater } from './components/FlowCanvas';
import { Toolbar } from './components/Toolbar';
import { Inspector } from './components/Inspector';
import { IssuesPanel } from './components/IssuesPanel';
import { DebugPanel } from './components/DebugPanel';

type Tab = 'inspector' | 'issues' | 'debug';

export function App() {
  const history = useMachineHistory(
    useMemo(() => loadFromLocal() ?? buildSampleMachine(), []),
  );
  const machine = history.machine;
  const machineRef = useRef(machine);
  machineRef.current = machine;

  const [selection, setSelection] = useState<Selection>(null);
  const [sim, setSim] = useState<SimState | null>(null);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<Tab>('inspector');
  const [toast, setToast] = useState<string | null>(null);
  const [panelResetKey, setPanelResetKey] = useState(0);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>(0);

  const issues = useMemo(() => analyzeMachine(machine), [machine]);

  const { nodeIssue, edgeIssue } = useMemo(() => {
    const nodeMap = new Map<string, 'error' | 'warning'>();
    const edgeMap = new Map<string, 'error' | 'warning'>();
    const rank = { error: 2, warning: 1 } as const;
    for (const issue of issues) {
      if (issue.stateId) {
        const cur = nodeMap.get(issue.stateId);
        if (!cur || rank[issue.severity] > rank[cur]) nodeMap.set(issue.stateId, issue.severity);
      }
      for (const tid of issue.transitionIds ?? []) {
        const cur = edgeMap.get(tid);
        if (!cur || rank[issue.severity] > rank[cur]) edgeMap.set(tid, issue.severity);
      }
    }
    return { nodeIssue: nodeMap, edgeIssue: edgeMap };
  }, [issues]);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.length - errorCount;

  // 结构性变化（非拖动）时使进行中的模拟失效，避免基于过期流程继续推演
  const structureKey = useMemo(
    () =>
      JSON.stringify({
        ...machine,
        states: machine.states.map(({ x: _x, y: _y, ...rest }) => rest),
      }),
    [machine],
  );
  const lastStructureKey = useRef(structureKey);
  useEffect(() => {
    if (lastStructureKey.current !== structureKey) {
      lastStructureKey.current = structureKey;
      setSim(null);
      setPlaying(false);
    }
  }, [structureKey]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  /* ---------- 画布定位 ---------- */

  const focusState = useCallback((id: string) => {
    const s = machineRef.current.states.find((st) => st.id === id);
    const rf = rfRef.current;
    if (!s || !rf) return;
    rf.setCenter(s.x + NODE_WIDTH / 2, s.y + NODE_HEIGHT / 2, { zoom: 1.15, duration: 450 });
  }, []);

  const focusTransition = useCallback((id: string) => {
    const m = machineRef.current;
    const t = m.transitions.find((tr) => tr.id === id);
    const rf = rfRef.current;
    if (!t || !rf) return;
    const a = m.states.find((s) => s.id === t.from);
    const b = m.states.find((s) => s.id === t.to);
    if (!a || !b) return;
    rf.setCenter((a.x + b.x) / 2 + NODE_WIDTH / 2, (a.y + b.y) / 2 + NODE_HEIGHT / 2, {
      zoom: 1.0,
      duration: 450,
    });
  }, []);

  const onFocusIssue = useCallback(
    (issue: Issue) => {
      if (issue.transitionIds && issue.transitionIds.length > 0) {
        setSelection({ kind: 'transition', id: issue.transitionIds[0] });
        focusTransition(issue.transitionIds[0]);
      } else if (issue.stateId) {
        setSelection({ kind: 'state', id: issue.stateId });
        focusState(issue.stateId);
      }
    },
    [focusState, focusTransition],
  );

  /* ---------- 模拟调试 ---------- */

  const startSim = useCallback((context: Record<string, unknown>, events: string[]) => {
    setSim(createSimulation(machineRef.current, events, context));
    setPlaying(false);
  }, []);

  const stepForward = useCallback(() => {
    setSim((s) => (s ? simStepForward(machineRef.current, s) : s));
  }, []);

  const stepBack = useCallback(() => {
    setPlaying(false);
    setSim((s) => (s ? simStepBack(s) : s));
  }, []);

  const stopSim = useCallback(() => {
    setSim(null);
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setSim((s) => {
        if (!s || s.finished) {
          setPlaying(false);
          return s;
        }
        return simStepForward(machineRef.current, s);
      });
    }, 900);
    return () => window.clearInterval(id);
  }, [playing]);

  const onFocusStep = useCallback(
    (step: SimStep) => {
      if (step.transitionId) focusTransition(step.transitionId);
      else if (step.fromId) focusState(step.fromId);
    },
    [focusState, focusTransition],
  );

  const simCurrentId = sim?.currentStateId ?? null;
  const simActiveTransitionId = useMemo(() => {
    if (!sim) return null;
    for (let i = sim.steps.length - 1; i >= 0; i--) {
      if (sim.steps[i].transitionId) return sim.steps[i].transitionId;
    }
    return null;
  }, [sim]);

  /* ---------- 工具栏动作 ---------- */

  const handleSelect = useCallback((sel: SelectionUpdater) => {
    if (typeof sel === 'function') {
      setSelection((prev) => sel(prev));
    } else {
      setSelection(sel);
      if (sel) setTab('inspector');
    }
  }, []);

  const addStateAtCenter = useCallback(() => {
    const rf = rfRef.current;
    const pos = rf
      ? rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 200, y: 200 };
    history.commit(addState(machineRef.current, { x: pos.x - 84, y: pos.y - 26 }));
  }, [history]);

  const doAutoLayout = useCallback(() => {
    const positions = autoLayout(machineRef.current);
    const next = cloneMachine(machineRef.current);
    for (const s of next.states) {
      const p = positions[s.id];
      if (p) {
        s.x = p.x;
        s.y = p.y;
      }
    }
    history.commit(next);
    window.setTimeout(() => rfRef.current?.fitView({ duration: 300, padding: 0.15 }), 60);
  }, [history]);

  const loadSample = useCallback(() => {
    history.reset(buildSampleMachine());
    setSelection(null);
    setPanelResetKey((k) => k + 1);
    window.setTimeout(() => rfRef.current?.fitView({ duration: 300, padding: 0.15 }), 60);
    showToast('已载入示例流程（含不可达、死胡同、非确定性问题）');
  }, [history, showToast]);

  const clearAll = useCallback(() => {
    if (!window.confirm('确定清空当前状态机吗？此操作可通过撤销恢复之前需要先导出。')) return;
    history.reset(createEmptyMachine());
    setSelection(null);
    setPanelResetKey((k) => k + 1);
  }, [history]);

  const exportJson = useCallback(() => {
    const blob = new Blob([serializeMachine(machineRef.current)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${machineRef.current.name || 'state-machine'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importJsonFile = useCallback(
    (file: File) => {
      file
        .text()
        .then((text) => {
          const imported = parseMachine(text);
          history.reset(imported);
          setSelection(null);
          setPanelResetKey((k) => k + 1);
          window.setTimeout(() => rfRef.current?.fitView({ duration: 300, padding: 0.15 }), 60);
          showToast(`已导入「${imported.name}」`);
        })
        .catch((e: unknown) => {
          showToast(`导入失败：${e instanceof Error ? e.message : String(e)}`);
        });
    },
    [history, showToast],
  );

  const saveLocal = useCallback(() => {
    saveToLocal(machineRef.current);
    showToast('已保存到浏览器本地存储');
  }, [showToast]);

  const loadLocal = useCallback(() => {
    const m = loadFromLocal();
    if (!m) {
      showToast('没有找到本地存档');
      return;
    }
    history.reset(m);
    setSelection(null);
    setPanelResetKey((k) => k + 1);
    window.setTimeout(() => rfRef.current?.fitView({ duration: 300, padding: 0.15 }), 60);
    showToast('已从本地存储恢复');
  }, [history, showToast]);

  /* ---------- 快捷键 ---------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        history.undo();
      } else if ((mod && e.key.toLowerCase() === 'z' && e.shiftKey) || (mod && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history]);

  /* ---------- 渲染 ---------- */

  return (
    <div className="app">
      <Toolbar
        machineName={machine.name}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        errorCount={errorCount}
        warningCount={warningCount}
        onAddState={addStateAtCenter}
        onAutoLayout={doAutoLayout}
        onUndo={history.undo}
        onRedo={history.redo}
        onFitView={() => rfRef.current?.fitView({ duration: 300, padding: 0.15 })}
        onLoadSample={loadSample}
        onImport={() => fileInputRef.current?.click()}
        onExport={exportJson}
        onSaveLocal={saveLocal}
        onLoadLocal={loadLocal}
        onClear={clearAll}
      />
      <div className="main">
        <div className="canvas-wrap">
          <FlowCanvas
            machine={machine}
            nodeIssue={nodeIssue}
            edgeIssue={edgeIssue}
            simCurrentId={simCurrentId}
            simActiveTransitionId={simActiveTransitionId}
            selection={selection}
            onSelect={handleSelect}
            onLiveChange={history.setLive}
            onCommit={history.commit}
            onDragStart={history.beginTransient}
            onDragEnd={history.endTransient}
            onInit={(instance) => {
              rfRef.current = instance;
            }}
          />
        </div>
        <aside className="sidebar">
          <div className="tabs">
            <button
              className={tab === 'inspector' ? 'tab active' : 'tab'}
              onClick={() => setTab('inspector')}
            >
              检查
            </button>
            <button
              className={tab === 'issues' ? 'tab active' : 'tab'}
              onClick={() => setTab('issues')}
            >
              问题{issues.length > 0 ? ` (${issues.length})` : ''}
            </button>
            <button
              className={tab === 'debug' ? 'tab active' : 'tab'}
              onClick={() => setTab('debug')}
            >
              调试
            </button>
          </div>
          <div className="sidebar-body">
            {tab === 'inspector' && (
              <Inspector
                machine={machine}
                selection={selection}
                onLiveChange={history.setLive}
                onCommit={history.commit}
                beginTransient={history.beginTransient}
                endTransient={history.endTransient}
                onSelect={handleSelect}
              />
            )}
            {tab === 'issues' && <IssuesPanel issues={issues} onFocus={onFocusIssue} />}
            {tab === 'debug' && (
              <DebugPanel
                key={panelResetKey}
                machine={machine}
                sim={sim}
                playing={playing}
                initialEventsText={SAMPLE_EVENTS.join(', ')}
                onStart={startSim}
                onForward={stepForward}
                onBack={stepBack}
                onTogglePlay={() => setPlaying((p) => !p)}
                onStop={stopSim}
                onFocusStep={onFocusStep}
              />
            )}
          </div>
        </aside>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importJsonFile(file);
          e.target.value = '';
        }}
      />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
