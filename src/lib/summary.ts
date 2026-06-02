import type { AttentionFlag, DerivedTask } from "../types/ops";
import { addDays, formatShort, toDate, todayISO } from "./date";
import { groupTasks, sortTasks } from "./grouping";
import { opsConfig } from "./opsConfig";
import { flagLabels, phaseLabel } from "./theme";

export interface EodItem {
  id: string;
  title: string;
  phase: string;
  qaReworkCount: number;
  overdueDays: number;
  etaOverdue: boolean;
  blocked: boolean;
  inQa: boolean;
  action?: string;
}

export interface EodGroup {
  assignee: string;
  taskCount: number;
  items: EodItem[];
}

export interface EodReport {
  dateLabel: string;
  risk: { overdue: number; qaRejections: number; needsReview: number; blocked: number };
  totals: { active: number; inQa: number };
  groups: EodGroup[];
}

// Lower rank = more urgent = surfaced first. Founders care about what's on fire,
// so this drives both the on-screen ordering and the copied WhatsApp text.
export function riskRank(task: DerivedTask): number {
  if (task.etaStatus === "overdue") return 0;
  if (task.qaReworkCount > 0) return 1;
  if (opsConfig.isOnHold(task.currentPhase)) return 2;
  return 3;
}

function toItem(task: DerivedTask): EodItem {
  return {
    id: task.id,
    title: task.title,
    phase: phaseLabel(task.currentPhase),
    qaReworkCount: task.qaReworkCount,
    overdueDays: task.overdueDays,
    etaOverdue: task.etaStatus === "overdue",
    blocked: opsConfig.isOnHold(task.currentPhase),
    inQa: opsConfig.isQa(task.currentPhase),
    action: task.attentionSignals[0]?.action,
  };
}

export function buildEodReport(tasks: DerivedTask[], today = todayISO()): EodReport {
  // Same selection as before: touched in the last day, OR flagged, OR sitting in QA.
  const relevant = tasks.filter(
    (task) => task.modifiedAt >= addDays(today, -1) || task.attentionSignals.length > 0 || opsConfig.isQa(task.currentPhase),
  );

  const grouped = groupTasks(relevant, "assignee");

  const groups: EodGroup[] = Object.entries(grouped)
    .map(([assignee, assigneeTasks]) => {
      const items = [...assigneeTasks]
        .sort((a, b) => riskRank(a) - riskRank(b) || b.modifiedAt.localeCompare(a.modifiedAt))
        .map(toItem);
      return { assignee, taskCount: assigneeTasks.length, items };
    })
    // Most-at-risk assignee first: best (lowest) rank in the section, then size, then name.
    .sort((a, b) => sectionRank(a) - sectionRank(b) || b.taskCount - a.taskCount || a.assignee.localeCompare(b.assignee));

  return {
    dateLabel: toDate(today).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    risk: {
      overdue: tasks.filter((task) => task.etaStatus === "overdue").length,
      qaRejections: tasks.reduce((sum, task) => sum + task.qaReworkCount, 0),
      needsReview: tasks.filter((task) => opsConfig.isQa(task.currentPhase)).length,
      blocked: tasks.filter((task) => opsConfig.isOnHold(task.currentPhase)).length,
    },
    totals: {
      active: tasks.filter((task) => opsConfig.isActive(task.currentPhase)).length,
      inQa: tasks.filter((task) => opsConfig.isQa(task.currentPhase)).length,
    },
    groups,
  };
}

function sectionRank(group: EodGroup): number {
  return group.items.length ? Math.min(...group.items.map((item) => itemRank(item))) : 3;
}

function itemRank(item: EodItem): number {
  if (item.etaOverdue) return 0;
  if (item.qaReworkCount > 0) return 1;
  if (item.blocked) return 2;
  return 3;
}

// Clipboard / WhatsApp text. Kept in the original plain-text format the team is
// used to pasting into WhatsApp (the redesign only changed the on-screen modal,
// not this copy output). Numbered per-assignee lists with blank-line spacing.
export function generateEodReport(tasks: DerivedTask[], today = todayISO()): string {
  const byAssignee = groupTasks(
    tasks.filter((task) => task.modifiedAt >= addDays(today, -1) || task.attentionSignals.length > 0 || opsConfig.isQa(task.currentPhase)),
    "assignee",
  );
  const lines: string[] = [`EOD Update - ${toDate(today).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`, "----------------------------------------", ""];

  Object.entries(byAssignee)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([assignee, assigneeTasks]) => {
      lines.push(assignee.toUpperCase());
      lines.push("");
      sortTasks(assigneeTasks, {}).forEach((task, idx) => {
        const state = phaseLabel(task.currentPhase);
        const bits = [`${task.title} -> ${state}`];
        if (task.qaReworkCount) bits.push(`${task.qaReworkCount} QA bounce${task.qaReworkCount > 1 ? "es" : ""}`);
        if (task.etaStatus === "overdue") bits.push(`ETA missed by ${task.overdueDays}d`);
        const topSignal = task.attentionSignals[0];
        if (topSignal) bits.push(topSignal.action);
        lines.push(`${idx + 1}. ${bits.join(" | ")}`);
        lines.push("");
      });
    });

  const flagged = tasks.filter((task) => task.attentionSignals.length > 0);
  lines.push("----------------------------------------", "ATTENTION NEEDED", "");
  if (flagged.length === 0) {
    lines.push("1. No open operational flags");
    lines.push("");
  } else {
    const counts = flagged.reduce<Record<AttentionFlag, number>>((acc, task) => {
      task.attentionSignals.forEach((signal) => {
        acc[signal.flag] = (acc[signal.flag] ?? 0) + 1;
      });
      return acc;
    }, {} as Record<AttentionFlag, number>);
    Object.entries(counts).forEach(([flag, count], idx) => {
      lines.push(`${idx + 1}. ${count} ${flagLabels[flag as AttentionFlag]}`);
      lines.push("");
    });
  }

  const active = tasks.filter((task) => opsConfig.isActive(task.currentPhase)).length;
  const inQa = tasks.filter((task) => opsConfig.isQa(task.currentPhase)).length;
  lines.push(`Active: ${active} | In QA: ${inQa} | Generated: ${formatShort(today)}`);
  return lines.join("\n");
}
