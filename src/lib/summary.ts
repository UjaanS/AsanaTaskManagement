import type { DerivedTask } from "../types/ops";
import { addDays, toDate, todayISO } from "./date";
import { groupTasks } from "./grouping";
import { opsConfig } from "./opsConfig";
import { phaseLabel } from "./theme";

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

// Founder-friendly WhatsApp text. Plain text only (WhatsApp can't render HTML),
// but warm and scannable with light status emoji — not a database export.
export function renderEodText(report: EodReport): string {
  const lines: string[] = [`📋 Operations Update — ${report.dateLabel}`, ""];

  const riskBits: string[] = [];
  if (report.risk.overdue) riskBits.push(`🔴 ${report.risk.overdue} Overdue`);
  if (report.risk.qaRejections) riskBits.push(`🧪 ${report.risk.qaRejections} QA Rejection${report.risk.qaRejections > 1 ? "s" : ""}`);
  if (report.risk.needsReview) riskBits.push(`⚠️ ${report.risk.needsReview} Need Review`);
  if (report.risk.blocked) riskBits.push(`⛔ ${report.risk.blocked} Blocked`);
  if (riskBits.length === 0) riskBits.push("✅ Nothing at risk");
  lines.push(riskBits.join("   "));
  lines.push(`Active Tasks: ${report.totals.active}   In QA: ${report.totals.inQa}`);
  lines.push("");

  if (report.groups.length === 0) {
    lines.push("No updates to report today.");
    return lines.join("\n");
  }

  report.groups.forEach((group) => {
    lines.push(`${group.assignee} (${group.taskCount})`);
    group.items.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${itemLine(item)}`);
    });
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}

function itemLine(item: EodItem): string {
  let line = `${item.title} → ${item.phase}`;
  if (item.etaOverdue) line += ` ⚠️ ETA missed by ${item.overdueDays}d`;
  if (item.qaReworkCount) line += ` 🧪 ${item.qaReworkCount} QA bounce${item.qaReworkCount > 1 ? "es" : ""}`;
  if (item.blocked) line += " ⛔ blocked";
  if (item.action) line += ` — ${item.action}`;
  return line;
}

// Back-compat: callers/tests that want the plain-text report in one call.
export function generateEodReport(tasks: DerivedTask[], today = todayISO()): string {
  return renderEodText(buildEodReport(tasks, today));
}
