import { describe, expect, it } from "vitest";
import type { OpsTask } from "../types/ops";
import { deriveTask } from "./derive";

const baseTask: OpsTask = {
  id: "T-1",
  title: "Operational test task",
  project: "Ops",
  assignee: "Ravi",
  createdAt: "2026-05-01",
  modifiedAt: "2026-05-27",
  assignmentDate: "2026-05-01",
  status: "In Dev",
  phase: "In Dev",
  priority: "Medium",
  requestType: "Feature",
  eta: "2026-05-30",
  comments: [],
  phases: [{ type: "In Dev", start: "2026-05-01", end: null }],
  qaEvents: [],
  sortOrder: 1,
};

describe("deriveTask", () => {
  it("marks open tasks with missed ETAs as overdue and actionable", () => {
    const task = deriveTask({ ...baseTask, eta: "2026-05-25" }, "2026-05-28");

    expect(task.etaStatus).toBe("overdue");
    expect(task.overdueDays).toBe(3);
    expect(task.attentionFlags).toContain("eta_violation");
    expect(task.attentionSignals[0]).toMatchObject({
      flag: "eta_violation",
      severity: "critical",
      source: "eta",
    });
  });

  it("does not mark closed tasks as overdue", () => {
    const task = deriveTask(
      {
        ...baseTask,
        eta: "2026-05-25",
        phase: "Completed",
        phases: [{ type: "Completed", start: "2026-05-25", end: "2026-05-25" }],
      },
      "2026-05-28",
    );

    expect(task.etaStatus).toBe("ok");
    expect(task.attentionFlags).not.toContain("eta_violation");
  });

  it("detects live-comment status mismatch with recommended action", () => {
    const task = deriveTask(
      {
        ...baseTask,
        status: "QA Done/ In ER",
        phase: "QA Done/ In ER",
        phases: [{ type: "QA Done/ In ER", start: "2026-05-26", end: null }],
        comments: [{ id: "c1", author: "Nam", body: "Client confirms this is live in production.", createdAt: "2026-05-27" }],
      },
      "2026-05-28",
    );

    const signal = task.attentionSignals.find((item) => item.flag === "possible_stale_status");
    expect(signal?.reason).toContain("live/released");
    expect(signal?.action).toContain("Verify status");
  });
});
