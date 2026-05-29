import { describe, expect, it } from "vitest";
import { mockTasks } from "../data/mockTasks";
import { deriveTasks } from "./derive";
import { generateEodReport } from "./summary";

describe("generateEodReport", () => {
  it("includes grouped updates and attention counts", () => {
    const report = generateEodReport(deriveTasks(mockTasks, "2026-05-28"), "2026-05-28");

    expect(report).toContain("EOD Update - 28 May 2026");
    expect(report).toContain("ATTENTION NEEDED");
    expect(report).toContain("ETA missed");
    expect(report).toContain("Active:");
  });
});
