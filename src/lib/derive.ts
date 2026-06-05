import type { DerivedTask, EtaStatus, OpsTask } from "../types/ops";
import { daysBetween, todayISO } from "./date";
import { detectSignals } from "./intelligence";
import { opsConfig } from "./opsConfig";

export function deriveTask(task: OpsTask, today = todayISO()): DerivedTask {
  const latestComment = [...task.comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const currentPhase = task.phases[task.phases.length - 1]?.type ?? task.phase;
  const staleDays = Math.max(0, daysBetween(task.modifiedAt, today));
  const overdueDays = task.eta && task.eta < today && !opsConfig.isClosed(currentPhase)
    ? daysBetween(task.eta, today)
    : 0;
  const etaStatus = getEtaStatus(task.eta, currentPhase, today);
  const qaReworkCount = task.qaEvents.filter((event) => event.type === "failed").length;
  // Strict rolling window: created_at within the last opsConfig.recentTaskMonths.
  // The dashboard's "Show older tasks" toggle releases this filter via showOld.
  const includedByDefault = task.createdAt >= opsConfig.recentCreatedSince(today);

  const base: DerivedTask = {
    ...task,
    latestComment,
    currentPhase,
    etaStatus,
    overdueDays,
    staleDays,
    qaReworkCount,
    attentionFlags: [],
    attentionSignals: [],
    includedByDefault,
  };

  const attentionSignals = detectSignals(base, today);
  return {
    ...base,
    attentionSignals,
    attentionFlags: attentionSignals.map((signal) => signal.flag),
  };
}

export function deriveTasks(tasks: OpsTask[], today = todayISO()): DerivedTask[] {
  return tasks.map((task) => deriveTask(task, today));
}

// Lower rank = more urgent = surfaced first. Shared by the EOD report and the
// Assignees view so "what's on fire" is ordered consistently across the app.
export function riskRank(task: DerivedTask): number {
  if (task.etaStatus === "overdue") return 0;
  if (task.qaReworkCount > 0) return 1;
  if (opsConfig.isOnHold(task.currentPhase)) return 2;
  return 3;
}

export function getEtaStatus(eta: string | null, phase: DerivedTask["currentPhase"], today = todayISO()): EtaStatus {
  if (!eta) return "missing";
  if (opsConfig.isClosed(phase)) return "ok";
  if (eta < today) return "overdue";
  if (eta === today) return "due_today";
  return "ok";
}
