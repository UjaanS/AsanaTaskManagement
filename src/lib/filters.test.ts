import { describe, expect, it } from "vitest";
import { addDays, addMonths } from "./date";
import { deriveTasks } from "./derive";
import { applyFilters } from "./filters";
import { mockTasks } from "../data/mockTasks";
import type { Filters, OpsTask } from "../types/ops";

const emptyFilters: Filters = {
  assignee: "",
  project: "",
  phase: "",
  flag: "",
  query: "",
};

const TODAY = "2026-05-28";

function makeTask(overrides: Partial<OpsTask>): OpsTask {
  return {
    id: overrides.id ?? "TEST-1",
    title: overrides.title ?? "Test task",
    project: overrides.project ?? "Archive",
    assignee: overrides.assignee ?? "Ravi",
    createdAt: overrides.createdAt ?? "2026-04-01",
    modifiedAt: overrides.modifiedAt ?? "2026-05-01",
    assignmentDate: overrides.assignmentDate ?? overrides.createdAt ?? "2026-04-01",
    status: overrides.status ?? "In Dev",
    phase: overrides.phase ?? "In Dev",
    priority: overrides.priority ?? "Medium",
    requestType: overrides.requestType ?? "Feature",
    eta: overrides.eta ?? null,
    comments: overrides.comments ?? [],
    phases: overrides.phases ?? [{ type: overrides.phase ?? "In Dev", start: overrides.createdAt ?? "2026-04-01", end: null }],
    qaEvents: overrides.qaEvents ?? [],
    sortOrder: overrides.sortOrder ?? 1,
    ...overrides,
  };
}

describe("applyFilters", () => {
  const oldTask = makeTask({
    id: "OLD-1",
    title: "Legacy hidden task",
    createdAt: "2026-02-01",
    modifiedAt: "2026-03-01",
    assignmentDate: "2026-02-01",
    sortOrder: 99,
  });
  const tasks = deriveTasks([...mockTasks, oldTask], TODAY);

  it("hides old tasks unless Show Old is enabled", () => {
    const withoutOld = applyFilters(tasks, emptyFilters, false);
    const withOld = applyFilters(tasks, emptyFilters, true);

    expect(withOld.length).toBeGreaterThan(withoutOld.length);
    expect(withoutOld.some((task) => task.id === "OLD-1")).toBe(false);
    expect(withOld.some((task) => task.id === "OLD-1")).toBe(true);
  });

  it("filters by operational attention flag", () => {
    const etaBreaches = applyFilters(tasks, { ...emptyFilters, flag: "eta_violation" }, true);

    expect(etaBreaches.length).toBeGreaterThan(0);
    expect(etaBreaches.every((task) => task.attentionFlags.includes("eta_violation"))).toBe(true);
  });
});

describe("rolling 3-month created_at window", () => {
  // 4 months ago and beyond is "old" — should be hidden in the default view.
  const olderThanWindow = makeTask({
    id: "OLD-OUTSIDE",
    title: "Task created 4 months ago",
    createdAt: addMonths(TODAY, -4),
    modifiedAt: addDays(TODAY, -1), // recently modified, but creation is what matters
    assignmentDate: addMonths(TODAY, -4),
  });
  // 2 months ago is inside the 3-month window.
  const insideWindow = makeTask({
    id: "RECENT-INSIDE",
    title: "Task created 2 months ago",
    createdAt: addMonths(TODAY, -2),
    modifiedAt: addMonths(TODAY, -2),
    assignmentDate: addMonths(TODAY, -2),
  });
  // Created today — definitely inside.
  const createdToday = makeTask({
    id: "RECENT-TODAY",
    title: "Task created today",
    createdAt: TODAY,
    modifiedAt: TODAY,
    assignmentDate: TODAY,
  });

  const tasks = deriveTasks([olderThanWindow, insideWindow, createdToday], TODAY);

  it("default view excludes tasks created more than 3 months ago", () => {
    const visible = applyFilters(tasks, emptyFilters, false);
    expect(visible.some((task) => task.id === "OLD-OUTSIDE")).toBe(false);
  });

  it("toggle (Show older tasks = true) includes tasks older than 3 months", () => {
    const visible = applyFilters(tasks, emptyFilters, true);
    expect(visible.some((task) => task.id === "OLD-OUTSIDE")).toBe(true);
  });

  it("recent tasks (within the last 3 months) appear in the default view", () => {
    const visible = applyFilters(tasks, emptyFilters, false);
    expect(visible.some((task) => task.id === "RECENT-INSIDE")).toBe(true);
    expect(visible.some((task) => task.id === "RECENT-TODAY")).toBe(true);
  });
});
