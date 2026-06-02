// PhaseKey is the verbatim Asana status string (e.g. "In Dev", "Ready For QA",
// "Live on Demo"). Asana is the source of truth — we no longer abstract.
export type PhaseKey = string;

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

export type AttentionSeverity = "critical" | "high" | "medium" | "low";
export type AttentionSource = "eta" | "status" | "ownership" | "qa" | "activity" | "comment";

export interface AttentionSignal {
  flag: AttentionFlag;
  severity: AttentionSeverity;
  reason: string;
  source: AttentionSource;
  action: string;
  ageDays?: number;
}

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
  asanaUrl?: string;
  project: string;
  projectGid?: string;
  assignee: string | null;
  assigneeGid?: string | null;
  createdAt: string;
  modifiedAt: string;
  assignmentDate: string;
  recentlyReassigned?: boolean;
  status: string | null;
  phase: PhaseKey;
  priority: Priority;
  requestType: string;
  qaState?: string | null;
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
  attentionSignals: AttentionSignal[];
  includedByDefault: boolean;
}

export interface OpsDataSource {
  listTasks(options?: { includeOld?: boolean }): Promise<OpsTask[]>;
}

export interface ConnectionStatus {
  connected: boolean;
  workspaceGid: string | null;
  updatedAt: string | null;
}

export interface OpsSummary {
  completedToday: number;
  overdue: number;
  newBlockers: number;
  highRiskProjects: number;
  recentActivity: Array<{ id: string; type: string; title: string; createdAt: string }>;
}

export interface ProjectHealth {
  id: string;
  name: string;
  completionPct: number;
  overdueCount: number;
  blockerCount: number;
  riskScore: number;
  healthStatus: string;
  nextDeadline: string | null;
}

export interface UserWorkload {
  name: string;
  active: number;
  overdue: number;
  blocked: number;
  stale: number;
  completion: number;
}

export interface Filters {
  assignee: string;
  project: string;
  phase: string;
  flag: string;
  query: string;
}
