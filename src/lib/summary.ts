import type { AttentionFlag, DerivedTask } from "../types/ops";
import { addDays, formatShort, todayISO, toDate } from "./date";
import { groupTasks, sortTasks } from "./grouping";
import { opsConfig } from "./opsConfig";
import { flagLabels, phaseLabels } from "./theme";

export function generateEodReport(tasks: DerivedTask[], today = todayISO()): string {
  const byAssignee = groupTasks(
    tasks.filter((task) => task.modifiedAt >= addDays(today, -1) || task.attentionSignals.length > 0 || task.currentPhase === "QA"),
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
        const topSignal = task.attentionSignals[0];
        if (topSignal) bits.push(topSignal.action);
        lines.push(`* ${bits.join(" | ")}`);
      });
      lines.push("");
    });

  const flagged = tasks.filter((task) => task.attentionSignals.length > 0);
  lines.push("----------------------------------------", "ATTENTION NEEDED");
  if (flagged.length === 0) {
    lines.push("* No open operational flags");
  } else {
    const counts = flagged.reduce<Record<AttentionFlag, number>>((acc, task) => {
      task.attentionSignals.forEach((signal) => {
        acc[signal.flag] = (acc[signal.flag] ?? 0) + 1;
      });
      return acc;
    }, {} as Record<AttentionFlag, number>);
    Object.entries(counts).forEach(([flag, count]) => {
      lines.push(`* ${count} ${flagLabels[flag as AttentionFlag]}`);
    });
  }

  const active = tasks.filter((task) => opsConfig.activePhases.includes(task.currentPhase)).length;
  const inQa = tasks.filter((task) => task.currentPhase === "QA").length;
  lines.push("", `Active: ${active} | In QA: ${inQa} | Generated: ${formatShort(today)}`);
  return lines.join("\n");
}
