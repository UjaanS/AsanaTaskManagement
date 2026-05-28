import type { AttentionFlag, EtaStatus, PhaseKey, Priority } from "../types/ops";
import { flagLabels, phaseClass, phaseLabels } from "../lib/theme";

export function PhaseBadge({ phase }: { phase: PhaseKey }) {
  return <span className={`badge phase ${phaseClass[phase]}`}>{phaseLabels[phase]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge priority priority-${priority.toLowerCase()}`}>{priority}</span>;
}

export function EtaBadge({ status, overdueDays }: { status: EtaStatus; overdueDays: number }) {
  const label = status === "overdue" ? `${overdueDays}d overdue` : status === "due_today" ? "Due today" : status === "missing" ? "No ETA" : "ETA ok";
  return <span className={`badge eta eta-${status}`}>{label}</span>;
}

export function FlagBadge({ flag }: { flag: AttentionFlag }) {
  return <span className={`badge flag flag-${flag}`}>{flagLabels[flag]}</span>;
}
