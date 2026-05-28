import type { RangePreset } from "../types/ops";
import { addDays, daysBetween, todayISO } from "./date";

export function getRange(preset: RangePreset, customStart?: string, customEnd?: string, today = todayISO()) {
  if (preset === "week") return { start: addDays(today, -3), totalDays: 10 };
  if (preset === "previous_week") return { start: addDays(today, -10), totalDays: 7 };
  if (preset === "month") return { start: addDays(today, -14), totalDays: 35 };
  if (preset === "previous_month") return { start: addDays(today, -44), totalDays: 30 };
  if (customStart && customEnd && customEnd >= customStart) {
    return { start: customStart, totalDays: Math.max(1, daysBetween(customStart, customEnd) + 1) };
  }
  return { start: addDays(today, -14), totalDays: 35 };
}

export function isDateInRange(date: string, rangeStart: string, totalDays: number): boolean {
  return date >= rangeStart && date < addDays(rangeStart, totalDays);
}
