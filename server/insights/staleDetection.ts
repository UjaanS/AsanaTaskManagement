export type StaleSeverity = "fresh" | "warning" | "critical";

export function staleSeverity(lastUpdated: Date, warningDays = 3, criticalDays = 7): StaleSeverity {
  const ageMs = Date.now() - lastUpdated.getTime();
  const ageDays = ageMs / 86_400_000;
  if (ageDays >= criticalDays) return "critical";
  if (ageDays >= warningDays) return "warning";
  return "fresh";
}
