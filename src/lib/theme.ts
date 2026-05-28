import type { AttentionFlag, PhaseKey } from "../types/ops";

export const phaseLabels: Record<PhaseKey, string> = {
  TODO: "To Do",
  DEV: "Development",
  QA: "In QA",
  QA_PASSED: "QA Passed",
  QA_FAILED: "QA Failed",
  ER: "Release",
  DONE: "Done",
  ON_HOLD: "On Hold",
  LIVE: "Live",
};

export const phaseClass: Record<PhaseKey, string> = {
  TODO: "phase-todo",
  DEV: "phase-dev",
  QA: "phase-qa",
  QA_PASSED: "phase-qa-passed",
  QA_FAILED: "phase-qa-failed",
  ER: "phase-er",
  DONE: "phase-done",
  ON_HOLD: "phase-on-hold",
  LIVE: "phase-live",
};

export const flagLabels: Record<AttentionFlag, string> = {
  possible_stale_status: "Possible stale status",
  qa_drift: "QA drift",
  silent_work: "Silent work",
  missing_owner: "Missing owner",
  missing_status: "Missing status",
  high_priority_stale: "High priority stale",
  eta_violation: "ETA violation",
};
