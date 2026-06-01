import type { DerivedTask, EtaStatus, OpsTask } from "../types/ops";
import { addDays, daysBetween, todayISO } from "./date";
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
  const includedByDefault =
    task.createdAt >= opsConfig.inclusionStartDate ||
    task.modifiedAt >= addDays(today, -opsConfig.recentModifiedDays) ||
    Boolean(task.recentlyReassigned);

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

export function getEtaStatus(eta: string | null, phase: DerivedTask["currentPhase"], today = todayISO()): EtaStatus {
  if (!eta) return "missing";
  if (opsConfig.isClosed(phase)) return "ok";
  if (eta < today) return "overdue";
  if (eta === today) return "due_today";
  return "ok";
}
