import { describe, expect, it } from "vitest";
import type { OpsTask } from "../../src/types/ops";
import { getSummary, listPersistedOpsTasks, listProjectHealth, listTaskDtos, listUserWorkloads, persistOpsTasks } from "./tasks";

process.env.DATABASE_URL = `file:/private/tmp/aocc-${Date.now()}-${Math.random().toString(16).slice(2)}.db`;

describe("task persistence", () => {
  it("persists ops tasks and exposes dashboard projections", async () => {
    await persistOpsTasks([taskFixture]);

    const opsTasks = await listPersistedOpsTasks();
    const taskDtos = await listTaskDtos(new URLSearchParams());
    const projects = await listProjectHealth();
    const workloads = await listUserWorkloads();
    const summary = await getSummary();

    expect(opsTasks).toHaveLength(1);
    expect(opsTasks[0].title).toBe("Fix checkout flow");
    expect(taskDtos[0].risk.score).toBeGreaterThan(0);
    expect(projects[0].name).toBe("Payments");
    expect(workloads[0].name).toBe("Asha");
    expect(summary.recentActivity[0].title).toBe("Fix checkout flow");
  });
});

const taskFixture: OpsTask = {
  id: "1200",
  title: "Fix checkout flow",
  asanaUrl: "https://app.asana.com/0/1/1200",
  project: "Payments",
  projectGid: "project-1",
  assignee: "Asha",
  assigneeGid: "user-1",
  createdAt: "2026-05-01",
  modifiedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
  assignmentDate: "2026-05-01",
  status: "Blocked",
  phase: "ON_HOLD",
  priority: "High",
  requestType: "Bug",
  qaState: null,
  eta: null,
  dueDate: new Date(Date.now() - 86_400_000).toISOString(),
  completedAt: null,
  liveDate: null,
  comments: [],
  phases: [{ type: "ON_HOLD", start: "2026-05-01", end: null }],
  qaEvents: [],
  sortOrder: 1,
};
