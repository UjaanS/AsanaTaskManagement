import type { DerivedTask } from "../types/ops";
import { opsConfig } from "./opsConfig";

export function getStats(tasks: DerivedTask[]) {
  const active = tasks.filter((task) => opsConfig.isActive(task.currentPhase)).length;
  const blocked = tasks.filter((task) => opsConfig.isOnHold(task.currentPhase)).length;
  const stale = tasks.filter((task) => task.attentionFlags.includes("silent_work") || task.attentionFlags.includes("high_priority_stale")).length;
  const qaFailed = tasks.reduce((sum, task) => sum + task.qaReworkCount, 0);
  const etaBreached = tasks.filter((task) => task.etaStatus === "overdue").length;
  const missingOwner = tasks.filter((task) => !task.assignee).length;

  return { total: tasks.length, active, blocked, stale, qaFailed, etaBreached, missingOwner };
}
