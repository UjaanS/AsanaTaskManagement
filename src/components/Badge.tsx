import type { AttentionFlag, AttentionSignal, EtaStatus, PhaseKey, Priority } from "../types/ops";
import { flagLabels, phaseClass, phaseLabel } from "../lib/theme";

export function PhaseBadge({ phase }: { phase: PhaseKey }) {
  return <span className={`badge phase ${phaseClass(phase)}`}>{phaseLabel(phase)}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`badge priority priority-${priority.toLowerCase()}`}>{priority}</span>;
}

export function EtaBadge({ status, overdueDays }: { status: EtaStatus; overdueDays: number }) {
  const label = status === "overdue" ? `${overdueDays}d overdue` : status === "due_today" ? "Due today" : status === "missing" ? "No ETA" : "ETA ok";
  return <span className={`badge eta eta-${status}`}>{label}</span>;
}

export function FlagBadge({ flag, signal }: { flag?: AttentionFlag; signal?: AttentionSignal }) {
  const resolvedFlag = signal?.flag ?? flag;
  if (!resolvedFlag) return null;
  const title = signal ? `${signal.reason} ${signal.action}` : flagLabels[resolvedFlag];
  return (
    <span className={`badge flag flag-${resolvedFlag} ${signal ? `severity-${signal.severity}` : ""}`} title={title}>
      {flagLabels[resolvedFlag]}
    </span>
  );
}
