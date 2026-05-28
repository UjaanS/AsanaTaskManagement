import type { AttentionSeverity } from "../../src/types/ops";
import { staleSeverity } from "./staleDetection";

interface RiskTask {
  dueDate: Date | null;
  blocked: boolean;
  status: string;
  completed: boolean;
  lastUpdated: Date;
}

export interface TaskRiskResult {
  score: number;
  severity: AttentionSeverity;
  reasons: string[];
}

export function calculateTaskRisk(task: RiskTask): TaskRiskResult {
  let score = 0;
  const reasons: string[] = [];

  if (task.completed) return { score: 0, severity: "low", reasons };

  if (task.blocked) {
    score += 40;
    reasons.push("Blocked");
  }

  if (task.dueDate) {
    const diffDays = (task.dueDate.getTime() - Date.now()) / 86_400_000;
    if (diffDays < 0) {
      score += 35;
      reasons.push("Overdue");
    } else if (diffDays <= 2) {
      score += 20;
      reasons.push("Due soon");
    }

    if (diffDays <= 2 && /todo|not[_\s-]?started/i.test(task.status)) {
      score += 20;
      reasons.push("Not started near due date");
    }
  }

  const stale = staleSeverity(task.lastUpdated);
  if (stale === "warning") {
    score += 10;
    reasons.push("Inactive for 3+ days");
  }
  if (stale === "critical") {
    score += 25;
    reasons.push("Inactive for 7+ days");
  }

  const severity = score >= 70 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : "low";
  return { score, severity, reasons };
}
