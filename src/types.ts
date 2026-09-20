import type { Edge, Node } from '@xyflow/react';

export interface StateNodeData extends Record<string, unknown> {
  label: string;
  initial: boolean;
  final: boolean;
}

export interface TransitionEdgeData extends Record<string, unknown> {
  event: string;
  guard: string;
}

export type StateNode = Node<StateNodeData, 'state'>;
export type TransitionEdge = Edge<TransitionEdgeData, 'transition'> & {
  data: TransitionEdgeData;
};

export interface Machine {
  nodes: StateNode[];
  edges: TransitionEdge[];
}

export type IssueSeverity = 'error' | 'warning';

export type IssueType =
  | 'no-initial'
  | 'multiple-initial'
  | 'unreachable'
  | 'dead-end'
  | 'ambiguous'
  | 'dangling-edge'
  | 'duplicate-label'
  | 'empty-label'
  | 'empty-event'
  | 'guard-syntax';

export interface AnalysisIssue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  detail?: string;
  nodeId?: string;
  edgeIds?: string[];
}

export interface GuardEvaluation {
  ok: boolean;
  value: boolean;
  raw?: unknown;
  error?: string;
}

export interface CandidateTransition {
  edgeId: string;
  from: string;
  to: string;
  event: string;
  guard: string;
  result: GuardEvaluation;
}

export type StepOutcome =
  | 'init'
  | 'transitioned'
  | 'no-transition'
  | 'ambiguous'
  | 'guard-error'
  | 'final-state'
  | 'completed';

export interface TraceStep {
  index: number;
  eventIndex: number | null;
  eventName: string | null;
  stateBefore: string | null;
  stateAfter: string | null;
  candidates: CandidateTransition[];
  takenEdgeId: string | null;
  outcome: StepOutcome;
  reason: string;
  stopped: boolean;
  remainingEvents: number;
}

export interface SerializedMachine {
  version: 1;
  nodes: Array<{
    id: string;
    label: string;
    initial: boolean;
    final: boolean;
    position: { x: number; y: number };
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    event: string;
    guard: string;
  }>;
}

export interface PersistedState {
  machine: SerializedMachine;
  savedAt: string;
}
