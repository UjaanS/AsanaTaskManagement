import type { AttentionSeverity, PhaseKey } from "../types/ops";

export const opsConfig = {
  inclusionStartDate: "2026-03-01",
  recentModifiedDays: 30,
  staleDays: 5,
  recentCommentDays: 3,
  qaDriftDays: 2,
  activePhases: ["TODO", "DEV", "QA", "QA_FAILED", "ER", "ON_HOLD"] as PhaseKey[],
  closedPhases: ["DONE", "LIVE"] as PhaseKey[],
  liveCommentKeywords: ["live", "production", "released"],
  attentionSeverity: {
    eta_violation: "critical",
    missing_owner: "critical",
    high_priority_stale: "high",
    qa_drift: "high",
    possible_stale_status: "medium",
    missing_status: "medium",
    silent_work: "low",
  } satisfies Record<string, AttentionSeverity>,
};
