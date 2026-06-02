import type { AttentionFlag, AttentionSignal, DerivedTask } from "../types/ops";
import { addDays } from "./date";
import { opsConfig } from "./opsConfig";

export function detectSignals(task: DerivedTask, today: string): AttentionSignal[] {
  const signals: AttentionSignal[] = [];
  const commentText = task.comments.map((comment) => comment.body.toLowerCase()).join(" ");
  const hasLiveComment = opsConfig.liveCommentKeywords.some((keyword) => {
    const pattern = new RegExp(`\\b${keyword}\\b`, "i");
    return pattern.test(commentText);
  });
  const lastQaFailure = [...task.qaEvents]
    .filter((event) => event.type === "failed")
    .sort((a, b) => b.at.localeCompare(a.at))[0];

  if (!task.assignee) {
    signals.push(signal("missing_owner", "ownership", "Task has no assignee.", "Assign an owner before the next EOD update."));
  }

  if (!task.status) {
    signals.push(signal("missing_status", "status", "Task has no normalized status.", "Confirm the Asana status/custom field mapping."));
  }

  if (task.etaStatus === "overdue") {
    signals.push(signal(
      "eta_violation",
      "eta",
      `ETA missed by ${task.overdueDays} day${task.overdueDays === 1 ? "" : "s"}.`,
      "Escalate owner and ask for revised ETA or closure.",
      task.overdueDays,
    ));
  }

  if (hasLiveComment && !opsConfig.isClosed(task.currentPhase)) {
    signals.push(signal(
      "possible_stale_status",
      "comment",
      "Recent comments indicate live/released work while status is still open.",
      "Verify status in Asana and move to Live/Done if accurate.",
    ));
  }

  // QA drift: a bounce happened (In QA → In Dev) and the task hasn't been retested
  // within qaDriftDays. The ticket is sitting in dev after a failure.
  if (
    lastQaFailure &&
    opsConfig.isDev(task.currentPhase) &&
    lastQaFailure.at <= addDays(today, -opsConfig.qaDriftDays)
  ) {
    signals.push(signal(
      "qa_drift",
      "qa",
      lastQaFailure.reason ? `QA bounce still needs follow-up: ${lastQaFailure.reason}` : "QA bounce and no retest is visible yet.",
      "Confirm rework owner and retest timing.",
    ));
  }

  if (
    opsConfig.isActive(task.currentPhase) &&
    task.staleDays >= opsConfig.staleDays &&
    !task.comments.some((comment) => comment.createdAt >= addDays(today, -opsConfig.recentCommentDays))
  ) {
    signals.push(signal(
      "silent_work",
      "activity",
      `No meaningful update for ${task.staleDays} day${task.staleDays === 1 ? "" : "s"}.`,
      "Request a status comment or move the task to the correct phase.",
      task.staleDays,
    ));
  }

  if (task.staleDays >= opsConfig.staleDays && ["Critical", "High"].includes(task.priority) && opsConfig.isActive(task.currentPhase)) {
    signals.push(signal(
      "high_priority_stale",
      "activity",
      `${task.priority} priority task is stale for ${task.staleDays} day${task.staleDays === 1 ? "" : "s"}.`,
      "Escalate in the daily operations review.",
      task.staleDays,
    ));
  }

  return sortSignals(signals);
}

export function sortSignals(signals: AttentionSignal[]): AttentionSignal[] {
  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...signals].sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.flag.localeCompare(b.flag));
}

function signal(flag: AttentionFlag, source: AttentionSignal["source"], reason: string, action: string, ageDays?: number): AttentionSignal {
  return {
    flag,
    severity: opsConfig.attentionSeverity[flag],
    source,
    reason,
    action,
    ageDays,
  };
}
