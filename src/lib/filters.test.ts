import { describe, expect, it } from "vitest";
import { deriveTasks } from "./derive";
import { applyFilters } from "./filters";
import { mockTasks } from "../data/mockTasks";
import type { Filters, OpsTask } from "../types/ops";

const emptyFilters: Filters = {
  assignee: "",
  project: "",
  priority: "",
  phase: "",
  requestType: "",
  flag: "",
  query: "",
};

describe("applyFilters", () => {
  const oldTask: OpsTask = {
    id: "OLD-1",
    title: "Legacy hidden task",
    project: "Archive",
    assignee: "Ravi",
    createdAt: "2026-02-01",
    modifiedAt: "2026-03-01",
    assignmentDate: "2026-02-01",
    status: "In Progress",
    phase: "DEV",
    priority: "Low",
    requestType: "Maintenance",
    eta: "2026-03-15",
    comments: [],
    phases: [{ type: "DEV", start: "2026-02-01", end: null }],
    qaEvents: [],
    sortOrder: 99,
  };
  const tasks = deriveTasks([...mockTasks, oldTask], "2026-05-28");

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
