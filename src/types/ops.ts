export type PhaseKey =
  | "TODO"
  | "DEV"
  | "QA"
  | "QA_PASSED"
  | "QA_FAILED"
  | "ER"
  | "DONE"
  | "ON_HOLD"
  | "LIVE";

export type Priority = "Critical" | "High" | "Medium" | "Low";
export type EtaStatus = "ok" | "due_today" | "overdue" | "missing";
export type ViewKey = "assignee" | "timeline" | "attention";
export type TimelineGroupKey = "assignee" | "project";
export type RangePreset = "week" | "previous_week" | "month" | "previous_month" | "custom";

export type AttentionFlag =
  | "possible_stale_status"
  | "qa_drift"
  | "silent_work"
  | "missing_owner"
  | "missing_status"
  | "high_priority_stale"
  | "eta_violation";

export interface OpsComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface OpsPhase {
  type: PhaseKey;
  start: string;
  end?: string | null;
  owner?: string;
  tester?: string;
  reason?: string;
}

export interface QAEvent {
  id: string;
  type: "moved_to_qa" | "passed" | "failed" | "rework_started";
  at: string;
  tester?: string;
  reason?: string;
}

export interface OpsTask {
  id: string;
  title: string;
  project: string;
  assignee: string | null;
  createdAt: string;
  modifiedAt: string;
  assignmentDate: string;
  recentlyReassigned?: boolean;
  status: string | null;
  phase: PhaseKey;
  priority: Priority;
  requestType: string;
  eta: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  liveDate?: string | null;
  comments: OpsComment[];
  latestComment?: OpsComment;
  phases: OpsPhase[];
  qaEvents: QAEvent[];
  sortOrder: number;
}

export interface DerivedTask extends OpsTask {
  etaStatus: EtaStatus;
  overdueDays: number;
  staleDays: number;
  qaReworkCount: number;
  currentPhase: PhaseKey;
  attentionFlags: AttentionFlag[];
  includedByDefault: boolean;
}

export interface Filters {
  assignee: string;
  project: string;
  priority: string;
  phase: string;
  requestType: string;
  flag: string;
  query: string;
}
