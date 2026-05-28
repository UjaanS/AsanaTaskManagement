import type { AttentionFlag, DerivedTask, EtaStatus, Filters, OpsTask, PhaseKey, RangePreset } from "../types/ops";
import { addDays, daysBetween, formatShort, todayISO, toDate } from "./date";
import { flagLabels, phaseLabels } from "./theme";

const defaultInclusionDate = "2026-03-01";
const activePhases: PhaseKey[] = ["TODO", "DEV", "QA", "QA_FAILED", "ER", "ON_HOLD"];

export function deriveTask(task: OpsTask, today = todayISO()): DerivedTask {
  const latestComment = [...task.comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const currentPhase = task.phases[task.phases.length - 1]?.type ?? task.phase;
  const staleDays = Math.max(0, daysBetween(task.modifiedAt, today));
  const overdueDays = task.eta && task.eta < today && !["DONE", "LIVE"].includes(currentPhase)
    ? daysBetween(task.eta, today)
    : 0;
  const etaStatus = getEtaStatus(task.eta, currentPhase, today);
  const qaReworkCount = task.qaEvents.filter((event) => event.type === "failed").length;
  const includedByDefault =
    task.createdAt >= defaultInclusionDate ||
    task.modifiedAt >= addDays(today, -30) ||
    Boolean(task.recentlyReassigned);

  const enriched: DerivedTask = {
    ...task,
    latestComment,
    currentPhase,
    etaStatus,
    overdueDays,
    staleDays,
    qaReworkCount,
    attentionFlags: [],
    includedByDefault,
  };

  return { ...enriched, attentionFlags: detectFlags(enriched, today) };
}

export function deriveTasks(tasks: OpsTask[], today = todayISO()): DerivedTask[] {
  return tasks.map((task) => deriveTask(task, today));
}

export function getEtaStatus(eta: string | null, phase: PhaseKey, today = todayISO()): EtaStatus {
  if (!eta) return "missing";
  if (["DONE", "LIVE"].includes(phase)) return "ok";
  if (eta < today) return "overdue";
  if (eta === today) return "due_today";
  return "ok";
}

export function detectFlags(task: DerivedTask, today = todayISO()): AttentionFlag[] {
  const flags = new Set<AttentionFlag>();
  const commentText = task.comments.map((comment) => comment.body.toLowerCase()).join(" ");
  const hasLiveComment = /\blive\b|\bproduction\b|\breleased\b/.test(commentText);

  if (!task.assignee) flags.add("missing_owner");
  if (!task.status) flags.add("missing_status");
  if (task.etaStatus === "overdue") flags.add("eta_violation");
  if (hasLiveComment && !["DONE", "LIVE"].includes(task.currentPhase)) flags.add("possible_stale_status");
  if (task.currentPhase === "QA_FAILED" || task.qaEvents.some((event) => event.type === "failed" && event.at <= addDays(today, -2))) {
    flags.add("qa_drift");
  }
  if (activePhases.includes(task.currentPhase) && task.staleDays >= 5 && !task.comments.some((comment) => comment.createdAt >= addDays(today, -3))) {
    flags.add("silent_work");
  }
  if (task.staleDays >= 5 && ["Critical", "High"].includes(task.priority) && activePhases.includes(task.currentPhase)) {
    flags.add("high_priority_stale");
  }

  return [...flags];
}

export function applyFilters(tasks: DerivedTask[], filters: Filters, showOld: boolean): DerivedTask[] {
  const query = filters.query.trim().toLowerCase();

  return tasks.filter((task) => {
    if (!showOld && !task.includedByDefault) return false;
    if (filters.assignee && (task.assignee ?? "Unassigned") !== filters.assignee) return false;
    if (filters.project && task.project !== filters.project) return false;
    if (filters.priority && task.priority !== filters.priority) return false;
    if (filters.phase && task.currentPhase !== filters.phase) return false;
    if (filters.requestType && task.requestType !== filters.requestType) return false;
    if (filters.flag && !task.attentionFlags.includes(filters.flag as AttentionFlag)) return false;
    if (query) {
      const haystack = [task.id, task.title, task.project, task.assignee ?? "Unassigned", task.status ?? "", task.latestComment?.body ?? ""]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function groupTasks(tasks: DerivedTask[], key: "assignee" | "project"): Record<string, DerivedTask[]> {
  return tasks.reduce<Record<string, DerivedTask[]>>((acc, task) => {
    const group = key === "assignee" ? task.assignee ?? "Unassigned" : task.project;
    acc[group] = acc[group] ?? [];
    acc[group].push(task);
    return acc;
  }, {});
}

export function sortTasks(tasks: DerivedTask[], order: Record<string, number>): DerivedTask[] {
  return [...tasks].sort((a, b) => {
    const orderA = order[a.id];
    const orderB = order[b.id];
    if (orderA !== undefined || orderB !== undefined) {
      return (orderA ?? a.sortOrder) - (orderB ?? b.sortOrder);
    }
    return b.modifiedAt.localeCompare(a.modifiedAt);
  });
}

export function getRange(preset: RangePreset, customStart?: string, customEnd?: string, today = todayISO()) {
  if (preset === "week") return { start: addDays(today, -3), totalDays: 10 };
  if (preset === "previous_week") return { start: addDays(today, -10), totalDays: 7 };
  if (preset === "month") return { start: addDays(today, -14), totalDays: 35 };
  if (preset === "previous_month") return { start: addDays(today, -44), totalDays: 30 };
  if (customStart && customEnd && customEnd >= customStart) {
    return { start: customStart, totalDays: Math.max(1, daysBetween(customStart, customEnd) + 1) };
  }
  return { start: addDays(today, -14), totalDays: 35 };
}

export function getStats(tasks: DerivedTask[]) {
  const active = tasks.filter((task) => activePhases.includes(task.currentPhase)).length;
  const blocked = tasks.filter((task) => task.currentPhase === "ON_HOLD").length;
  const stale = tasks.filter((task) => task.attentionFlags.includes("silent_work") || task.attentionFlags.includes("high_priority_stale")).length;
  const qaFailed = tasks.reduce((sum, task) => sum + task.qaReworkCount, 0);
  const etaBreached = tasks.filter((task) => task.etaStatus === "overdue").length;
  const missingOwner = tasks.filter((task) => !task.assignee).length;

  return { total: tasks.length, active, blocked, stale, qaFailed, etaBreached, missingOwner };
}

export function generateEodReport(tasks: DerivedTask[], today = todayISO()): string {
  const byAssignee = groupTasks(
    tasks.filter((task) => task.modifiedAt >= addDays(today, -1) || task.attentionFlags.length > 0 || task.currentPhase === "QA"),
    "assignee",
  );
  const lines: string[] = [`EOD Update - ${toDate(today).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`, "----------------------------------------", ""];

  Object.entries(byAssignee)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([assignee, assigneeTasks]) => {
      lines.push(assignee.toUpperCase());
      sortTasks(assigneeTasks, {}).forEach((task) => {
        const state = phaseLabels[task.currentPhase];
        const bits = [`${task.title} -> ${state}`];
        if (task.qaReworkCount) bits.push(`${task.qaReworkCount} QA bounce${task.qaReworkCount > 1 ? "es" : ""}`);
        if (task.etaStatus === "overdue") bits.push(`ETA missed by ${task.overdueDays}d`);
        if (task.attentionFlags.includes("possible_stale_status")) bits.push("possible stale status");
        lines.push(`* ${bits.join(" | ")}`);
      });
      lines.push("");
    });

  const flagged = tasks.filter((task) => task.attentionFlags.length > 0);
  lines.push("----------------------------------------", "ATTENTION NEEDED");
  if (flagged.length === 0) {
    lines.push("* No open operational flags");
  } else {
    const counts = flagged.reduce<Record<AttentionFlag, number>>((acc, task) => {
      task.attentionFlags.forEach((flag) => {
        acc[flag] = (acc[flag] ?? 0) + 1;
      });
      return acc;
    }, {} as Record<AttentionFlag, number>);
    Object.entries(counts).forEach(([flag, count]) => {
      lines.push(`* ${count} ${flagLabels[flag as AttentionFlag]}`);
    });
  }

  const active = tasks.filter((task) => activePhases.includes(task.currentPhase)).length;
  const inQa = tasks.filter((task) => task.currentPhase === "QA").length;
  lines.push("", `Active: ${active} | In QA: ${inQa} | Generated: ${formatShort(today)}`);
  return lines.join("\n");
}

export function uniqueValues<T>(items: T[], getter: (item: T) => string | null | undefined): string[] {
  return [...new Set(items.map(getter).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b));
}
