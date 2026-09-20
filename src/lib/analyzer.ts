import type { AnalysisIssue, Machine, StateNode, TransitionEdge } from '../types';
import { validateExpression } from './eval';

export interface AnalysisResult {
  issues: AnalysisIssue[];
  nodeIssueMap: Map<string, AnalysisIssue[]>;
  edgeIssueMap: Map<string, AnalysisIssue[]>;
  reachable: Set<string>;
}

const typeLabels: Record<string, string> = {
  'no-initial': '缺少初始状态',
  'multiple-initial': '存在多个初始状态',
  unreachable: '不可达状态',
  'dead-end': '死胡同（非结束状态）',
  ambiguous: '非确定性转换',
  'dangling-edge': '悬空转换',
  'duplicate-label': '状态重名',
  'empty-label': '状态名称为空',
  'empty-event': '转换事件为空',
  'guard-syntax': '守卫条件语法错误',
};

function addIssue(list: AnalysisIssue[], issue: AnalysisIssue) {
  list.push(issue);
}

export function analyzeMachine(machine: Machine): AnalysisResult {
  const issues: AnalysisIssue[] = [];
  const { nodes, edges } = machine;
  const nodeMap = new Map<string, StateNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const initials = nodes.filter((n) => n.data.initial);

  if (nodes.length === 0) {
    return {
      issues,
      nodeIssueMap: new Map(),
      edgeIssueMap: new Map(),
      reachable: new Set(),
    };
  }

  if (initials.length === 0) {
    addIssue(issues, {
      id: 'no-initial',
      type: 'no-initial',
      severity: 'error',
      message: '没有初始状态，调试器无法开始执行',
      detail: '请在属性面板中将某个状态标记为初始状态',
    });
  } else if (initials.length > 1) {
    addIssue(issues, {
      id: 'multiple-initial',
      type: 'multiple-initial',
      severity: 'error',
      message: `存在 ${initials.length} 个初始状态（${initials.map((n) => n.data.label || n.id).join('、')}），初始状态必须唯一`,
      nodeId: initials[0].id,
      edgeIds: initials.map((n) => n.id),
    });
  }

  // 空名称 / 重名
  const labelGroups = new Map<string, StateNode[]>();
  for (const node of nodes) {
    if (!node.data!.label.trim()) {
      addIssue(issues, {
        id: `empty-label-${node.id}`,
        type: 'empty-label',
        severity: 'error',
        message: '状态名称为空',
        nodeId: node.id,
      });
    } else {
      const list = labelGroups.get(node.data!.label) ?? [];
      list.push(node);
      labelGroups.set(node.data!.label, list);
    }
  }
  for (const [label, group] of labelGroups) {
    if (group.length > 1) {
      addIssue(issues, {
        id: `duplicate-label-${label}`,
        type: 'duplicate-label',
        severity: 'error',
        message: `状态名称 "${label}" 被 ${group.length} 个状态使用，名称必须唯一`,
        nodeId: group[0].id,
        edgeIds: group.map((n) => n.id),
      });
    }
  }

  // 悬空边
  for (const edge of edges) {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      addIssue(issues, {
        id: `dangling-${edge.id}`,
        type: 'dangling-edge',
        severity: 'error',
        message: '转换引用了已删除或不存在的状态',
        detail: `${edge.source} → ${edge.target}`,
        edgeIds: [edge.id],
      });
    }
  }

  // 空事件
  for (const edge of edges) {
    if (!edge.data!.event.trim()) {
      addIssue(issues, {
        id: `empty-event-${edge.id}`,
        type: 'empty-event',
        severity: 'warning',
        message: '转换没有配置事件名称，调试时永远无法被事件触发',
        edgeIds: [edge.id],
      });
    }
  }

  // 守卫语法错误
  for (const edge of edges) {
    if (edge.data!.guard.trim()) {
      const error = validateExpression(edge.data!.guard);
      if (error) {
        addIssue(issues, {
          id: `guard-syntax-${edge.id}`,
          type: 'guard-syntax',
          severity: 'error',
          message: `守卫条件语法错误：${error}`,
          edgeIds: [edge.id],
        });
      }
    }
  }

  // 可达性（忽略悬空边）
  const validEdges = edges.filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target));
  const adjacency = new Map<string, TransitionEdge[]>();
  for (const edge of validEdges) {
    const list = adjacency.get(edge.source) ?? [];
    list.push(edge);
    adjacency.set(edge.source, list);
  }

  const reachable = new Set<string>();
  if (initials.length === 1) {
    const queue = [initials[0].id];
    reachable.add(initials[0].id);
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of adjacency.get(current) ?? []) {
        if (!reachable.has(edge.target)) {
          reachable.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
  } else {
    // 多个初始状态时从任意初始状态出发都可达
    const queue = initials.map((n) => n.id);
    initials.forEach((n) => reachable.add(n.id));
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of adjacency.get(current) ?? []) {
        if (!reachable.has(edge.target)) {
          reachable.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
  }

  for (const node of nodes) {
    if (!reachable.has(node.id)) {
      addIssue(issues, {
        id: `unreachable-${node.id}`,
        type: 'unreachable',
        severity: 'error',
        message: `状态 "${node.data!.label || node.id}" 从初始状态出发不可达`,
        nodeId: node.id,
      });
    }
  }

  // 死胡同：可达、非结束、且没有任何有效出边
  for (const node of nodes) {
    if (!reachable.has(node.id) || node.data!.final) continue;
    const outgoing = adjacency.get(node.id) ?? [];
    if (outgoing.length === 0) {
      addIssue(issues, {
        id: `dead-end-${node.id}`,
        type: 'dead-end',
        severity: 'error',
        message: `状态 "${node.data!.label || node.id}" 是死胡同：非结束状态且没有任何转出转换`,
        nodeId: node.id,
      });
    }
  }

  // 非确定性：同一源状态、同一非空事件有多条转换
  const groups = new Map<string, TransitionEdge[]>();
  for (const edge of validEdges) {
    const event = edge.data!.event.trim();
    if (!event) continue;
    const key = `${edge.source}::${event}`;
    const list = groups.get(key) ?? [];
    list.push(edge);
    groups.set(key, list);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const [sourceId, event] = key.split('::');
    const source = nodeMap.get(sourceId);
    const unguarded = group.filter((e) => !e.data!.guard.trim());
    const hasSyntaxError = group.some((e) => e.data!.guard.trim() && validateExpression(e.data!.guard) !== null);
    const severity = unguarded.length >= 2 || hasSyntaxError ? 'error' : 'warning';
    const detail =
      unguarded.length >= 2
        ? `其中 ${unguarded.length} 条转换没有守卫条件，事件 "${event}" 触发时必然同时命中`
        : `事件 "${event}" 触发时，守卫条件可能同时成立；运行时不会随机选择，而是直接停止`;
    addIssue(issues, {
      id: `ambiguous-${sourceId}-${event}`,
      type: 'ambiguous',
      severity,
      message: `状态 "${source?.data.label || sourceId}" 在事件 "${event}" 下有 ${group.length} 条转换，存在非确定性`,
      detail,
      nodeId: sourceId,
      edgeIds: group.map((e) => e.id),
    });
  }

  const nodeIssueMap = new Map<string, AnalysisIssue[]>();
  const edgeIssueMap = new Map<string, AnalysisIssue[]>();
  for (const issue of issues) {
    const nodeIds = new Set<string>();
    if (issue.nodeId) nodeIds.add(issue.nodeId);
    if (issue.edgeIds && (issue.type === 'multiple-initial' || issue.type === 'duplicate-label')) {
      issue.edgeIds.forEach((id) => nodeIds.add(id));
    }
    nodeIds.forEach((id) => {
      const list = nodeIssueMap.get(id) ?? [];
      list.push(issue);
      nodeIssueMap.set(id, list);
    });
    const edgeIds = issue.edgeIds ?? [];
    for (const id of edgeIds) {
      if (nodeMap.has(id)) continue;
      const list = edgeIssueMap.get(id) ?? [];
      list.push(issue);
      edgeIssueMap.set(id, list);
    }
  }

  return { issues, nodeIssueMap, edgeIssueMap, reachable };
}

export function issueTypeLabel(type: string): string {
  return typeLabels[type] ?? type;
}
