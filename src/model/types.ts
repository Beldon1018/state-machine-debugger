export interface FSMState {
  id: string;
  name: string;
  x: number;
  y: number;
  initial: boolean;
  final: boolean;
}

export interface FSMTransition {
  id: string;
  from: string;
  to: string;
  event: string;
  guard: string;
}

export interface Machine {
  name: string;
  context: Record<string, unknown>;
  states: FSMState[];
  transitions: FSMTransition[];
}

export type IssueType =
  | 'no-initial'
  | 'multiple-initial'
  | 'unreachable'
  | 'dead-end'
  | 'nondeterminism'
  | 'guard-syntax'
  | 'empty-event'
  | 'dangling';

export interface Issue {
  type: IssueType;
  severity: 'error' | 'warning';
  message: string;
  stateId?: string;
  transitionIds?: string[];
}

export type StepStatus = 'ok' | 'ambiguous' | 'fail';

export interface SimStep {
  index: number;
  event: string | null;
  status: StepStatus;
  fromId: string | null;
  toId: string | null;
  transitionId: string | null;
  title: string;
  details: string[];
}

export interface SimState {
  events: string[];
  cursor: number;
  currentStateId: string | null;
  context: Record<string, unknown>;
  steps: SimStep[];
  finished: boolean;
  failed: boolean;
}
