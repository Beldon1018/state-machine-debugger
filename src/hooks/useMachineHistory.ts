import { useCallback, useRef, useState } from 'react';
import type { Machine } from '../model/types';

export interface MachineHistory {
  machine: Machine;
  /** 直接替换，不进历史（用于拖拽、输入过程中的实时更新）。 */
  setLive: (next: Machine) => void;
  /** 提交一次可撤销的修改。 */
  commit: (next: Machine) => void;
  /** 开始一段暂态编辑（拖拽/输入），期间所有 setLive 不产生历史。 */
  beginTransient: () => void;
  endTransient: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** 整体替换并清空历史（导入/载入示例/清空）。 */
  reset: (next: Machine) => void;
}

export function useMachineHistory(initial: Machine): MachineHistory {
  const machineRef = useRef(initial);
  const pastRef = useRef<Machine[]>([]);
  const futureRef = useRef<Machine[]>([]);
  const transientDepth = useRef(0);
  const transientSnapshot = useRef<string>('');
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const setLive = useCallback(
    (next: Machine) => {
      machineRef.current = next;
      bump();
    },
    [bump],
  );

  const commit = useCallback(
    (next: Machine) => {
      if (transientDepth.current === 0) {
        pastRef.current.push(machineRef.current);
        futureRef.current = [];
      }
      machineRef.current = next;
      bump();
    },
    [bump],
  );

  const beginTransient = useCallback(() => {
    if (transientDepth.current === 0) {
      pastRef.current.push(machineRef.current);
      futureRef.current = [];
      transientSnapshot.current = JSON.stringify(machineRef.current);
    }
    transientDepth.current += 1;
  }, []);

  const endTransient = useCallback(() => {
    transientDepth.current = Math.max(0, transientDepth.current - 1);
    if (transientDepth.current === 0) {
      // 暂态期间没有实际变化时，撤销掉刚才压入的快照，避免空历史
      if (JSON.stringify(machineRef.current) === transientSnapshot.current) {
        pastRef.current.pop();
      }
      bump();
    }
  }, [bump]);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(machineRef.current);
    machineRef.current = prev;
    bump();
  }, [bump]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(machineRef.current);
    machineRef.current = next;
    bump();
  }, [bump]);

  const reset = useCallback(
    (next: Machine) => {
      machineRef.current = next;
      pastRef.current = [];
      futureRef.current = [];
      transientDepth.current = 0;
      bump();
    },
    [bump],
  );

  return {
    machine: machineRef.current,
    setLive,
    commit,
    beginTransient,
    endTransient,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    reset,
  };
}
