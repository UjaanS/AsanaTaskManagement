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

// Deterministic name → pastel avatar colour. Same name always yields the same
// hue, so a person reads as "their colour" consistently across the dashboard.
export interface AvatarColor {
  bg: string;
  fg: string;
}

export function avatarColor(name: string | null | undefined): AvatarColor {
  const label = (name ?? "?").trim() || "?";
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) % 360;
  }
  const hue = hash;
  // Soft, readable: light tinted background with a saturated same-hue foreground.
  // Works against both light and dark surfaces because both channels share the hue.
  return {
    bg: `hsl(${hue} 70% 88%)`,
    fg: `hsl(${hue} 55% 32%)`,
  };
}

export function initials(name: string | null | undefined): string {
  const label = (name ?? "").trim();
  if (!label) return "?";
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
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
