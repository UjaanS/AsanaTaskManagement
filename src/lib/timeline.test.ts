import { describe, expect, it } from "vitest";
import { getRange, isDateInRange } from "./timeline";

describe("timeline helpers", () => {
  it("computes custom ranges inclusively", () => {
    expect(getRange("custom", "2026-05-01", "2026-05-05", "2026-05-28")).toEqual({
      start: "2026-05-01",
      totalDays: 5,
    });
  });

  it("detects whether ETA markers should render in range", () => {
    expect(isDateInRange("2026-05-10", "2026-05-01", 14)).toBe(true);
    expect(isDateInRange("2026-05-15", "2026-05-01", 14)).toBe(false);
  });
});
