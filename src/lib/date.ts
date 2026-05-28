export const MS_PER_DAY = 86_400_000;

export function toDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function todayISO(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(value: string, days: number): string {
  const date = toDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / MS_PER_DAY);
}

export function isWeekend(value: string): boolean {
  const day = toDate(value).getDay();
  return day === 0 || day === 6;
}

export function formatShort(value: string): string {
  return toDate(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function formatLong(value: string): string {
  return toDate(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
