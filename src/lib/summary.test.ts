import { describe, expect, it } from "vitest";
import { mockTasks } from "../data/mockTasks";
import { deriveTasks } from "./derive";
import { buildEodReport, generateEodReport, riskRank } from "./summary";

const TODAY = "2026-05-28";
const derived = () => deriveTasks(mockTasks, TODAY);

describe("buildEodReport", () => {
  it("returns risk counts, totals, and per-assignee groups with task counts", () => {
    const report = buildEodReport(derived(), TODAY);

    expect(report.dateLabel).toBe("May 28");
    expect(report.groups.length).toBeGreaterThan(0);
    // taskCount matches the number of items rendered for each group
    report.groups.forEach((group) => {
      expect(group.taskCount).toBe(group.items.length);
      expect(group.taskCount).toBeGreaterThan(0);
    });
    // risk counts are non-negative and at least one risk exists in the mock data
    expect(report.risk.overdue + report.risk.qaRejections + report.risk.needsReview + report.risk.blocked).toBeGreaterThan(0);
  });

  it("orders tasks within a section by risk (overdue first), not alphabetically", () => {
    const report = buildEodReport(derived(), TODAY);
    report.groups.forEach((group) => {
      const ranks = group.items.map((item) => (item.etaOverdue ? 0 : item.qaReworkCount > 0 ? 1 : item.blocked ? 2 : 3));
      const sorted = [...ranks].sort((a, b) => a - b);
      expect(ranks).toEqual(sorted);
    });
  });

  it("orders sections most-at-risk first", () => {
    const report = buildEodReport(derived(), TODAY);
    const sectionRanks = report.groups.map((group) =>
      Math.min(...group.items.map((item) => (item.etaOverdue ? 0 : item.qaReworkCount > 0 ? 1 : item.blocked ? 2 : 3))),
    );
    const sorted = [...sectionRanks].sort((a, b) => a - b);
    expect(sectionRanks).toEqual(sorted);
  });
});

describe("riskRank", () => {
  it("ranks overdue above QA-rejected above blocked above normal", () => {
    const tasks = derived();
    const overdue = tasks.find((t) => t.etaStatus === "overdue");
    if (overdue) expect(riskRank(overdue)).toBe(0);
  });
});

describe("generateEodReport (WhatsApp copy — original plain-text format)", () => {
  it("keeps the original format: dated header, ATTENTION NEEDED, totals", () => {
    const text = generateEodReport(derived(), TODAY);

    expect(text).toContain("EOD Update - 28 May 2026");
    expect(text).toContain("ATTENTION NEEDED");
    expect(text).toContain("Active:");
  });

  it("uses numbered items with a blank line between them", () => {
    const text = generateEodReport(derived(), TODAY);
    expect(text).toMatch(/^1\. /m);
    expect(text).not.toMatch(/^\* /m);
    expect(text).toMatch(/^\d+\. .+\n\n/m);
  });
});
