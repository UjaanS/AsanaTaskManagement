import type { AttentionFlag, PhaseKey } from "../types/ops";

// Asana statuses are user-facing strings; the dashboard shows them verbatim.
export function phaseLabel(phase: PhaseKey | null | undefined): string {
  return phase ?? "Unknown";
}

// Build a CSS class slug from an Asana status string.
// e.g. "In Dev" → "phase-in-dev", "QA Done/ In ER" → "phase-qa-done-in-er".
export function phaseClass(phase: PhaseKey | null | undefined): string {
  if (!phase) return "phase-unknown";
  const slug = phase.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `phase-${slug || "unknown"}`;
}

// Companion slug for the qa-dot variants in the timeline view.
export function phaseDotClass(phase: PhaseKey | null | undefined): string {
  if (!phase) return "phase-dot-unknown";
  const slug = phase.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `phase-dot-${slug || "unknown"}`;
}

export const flagLabels: Record<AttentionFlag, string> = {
  possible_stale_status: "Possible stale status",
  qa_drift: "QA drift",
  silent_work: "Silent work",
  missing_owner: "Missing owner",
  missing_status: "Missing status",
  high_priority_stale: "High priority stale",
  eta_violation: "ETA violation",
};
