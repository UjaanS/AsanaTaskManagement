import { describe, expect, it } from "vitest";
import { shouldEscalate } from "./insights/escalation";
import { calculateTaskRisk } from "./insights/etaRisk";
import { computeProjectHealth } from "./insights/projectHealth";
import { staleSeverity } from "./insights/staleDetection";
import { decryptSecret, encryptSecret } from "./security";

describe("server insights", () => {
  it("marks stale thresholds", () => {
    expect(staleSeverity(new Date(Date.now() - 4 * 86_400_000))).toBe("warning");
    expect(staleSeverity(new Date(Date.now() - 8 * 86_400_000))).toBe("critical");
  });

  it("calculates critical task risk", () => {
    const result = calculateTaskRisk({
      dueDate: new Date(Date.now() + 86_400_000),
      blocked: true,
      status: "not_started",
      completed: false,
      lastUpdated: new Date(Date.now() - 8 * 86_400_000),
    });

    expect(result.severity).toBe("critical");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("computes project health", () => {
    const health = computeProjectHealth({ completionPct: 30, overdueCount: 4, blockerCount: 3, totalCount: 8 });
    expect(["red", "yellow", "green"]).toContain(health.status);
    expect(health.riskScore).toBeGreaterThan(0);
  });

  it("triggers escalation for overdue high priority work", () => {
    expect(shouldEscalate({ blockedDays: 0, overdueDays: 1, priority: "High", staleDays: 1 })).toBe(true);
  });

  it("round trips encrypted secrets", () => {
    const encrypted = encryptSecret("asana-token", "test-secret");
    expect(encrypted).not.toContain("asana-token");
    expect(decryptSecret(encrypted, "test-secret")).toBe("asana-token");
  });
});
