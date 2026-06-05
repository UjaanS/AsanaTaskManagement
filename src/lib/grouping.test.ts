import { describe, expect, it } from "vitest";
import { deriveTasks } from "./derive";
import { sortTasks, sortTasksByRisk } from "./grouping";
import { mockTasks } from "../data/mockTasks";
import type { DerivedTask, OpsTask } from "../types/ops";

const TODAY = "2026-05-28";

function make(overrides: Partial<OpsTask>): OpsTask {
  return {
    id: overrides.id ?? "T",
    title: overrides.title ?? "Task",
    project: "P",
    assignee: "Ravi",
    createdAt: "2026-04-01",
    modifiedAt: overrides.modifiedAt ?? "2026-05-01",
    assignmentDate: "2026-04-01",
    status: overrides.status ?? "In Dev",
    phase: overrides.phase ?? "In Dev",
    priority: "Medium",
    requestType: "Feature",
    eta: overrides.eta ?? null,
    comments: [],
    phases: [{ type: overrides.phase ?? "In Dev", start: "2026-04-01", end: null }],
    qaEvents: overrides.qaEvents ?? [],
    sortOrder: overrides.sortOrder ?? 1,
    ...overrides,
  };
}

describe("sortTasksByRisk", () => {
  // An overdue task that was modified long ago vs a clean task modified today.
  const overdueStale = make({ id: "OVERDUE", eta: "2026-05-01", modifiedAt: "2026-05-02" });
  const cleanFresh = make({ id: "CLEAN", eta: "2026-06-30", modifiedAt: TODAY });
  const derived = (): DerivedTask[] => deriveTasks([cleanFresh, overdueStale], TODAY);

  it("surfaces the higher-risk task first when there is no manual order", () => {
    const sorted = sortTasksByRisk(derived(), {});
    expect(sorted[0].id).toBe("OVERDUE");
    expect(sorted[1].id).toBe("CLEAN");
  });

  it("plain sortTasks (modifiedAt) keeps the freshly-modified clean task first", () => {
    const sorted = sortTasks(derived(), {});
    expect(sorted[0].id).toBe("CLEAN");
  });

  it("manual drag order overrides the risk default", () => {
    const sorted = sortTasksByRisk(derived(), { CLEAN: 1, OVERDUE: 2 });
    expect(sorted[0].id).toBe("CLEAN");
    expect(sorted[1].id).toBe("OVERDUE");
  });

  it("is stable enough to run over the full mock dataset without throwing", () => {
    expect(() => sortTasksByRisk(deriveTasks(mockTasks, TODAY), {})).not.toThrow();
  });
});
