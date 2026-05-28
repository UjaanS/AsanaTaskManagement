import { getStats } from "../lib/ops";
import type { DerivedTask } from "../types/ops";

export function StatsBar({ tasks }: { tasks: DerivedTask[] }) {
  const stats = getStats(tasks);
  const items = [
    ["Total", stats.total, "muted"],
    ["Active", stats.active, "blue"],
    ["Blocked", stats.blocked, "orange"],
    ["Stale", stats.stale, "amber"],
    ["QA bounces", stats.qaFailed, "red"],
    ["ETA miss", stats.etaBreached, "red"],
    ["No owner", stats.missingOwner, "red"],
  ];

  return (
    <div className="stats-bar" aria-label="Operational stats">
      {items.map(([label, value, tone]) => (
        <div className="stat" key={label}>
          <div className={`stat-value tone-${tone}`}>{value}</div>
          <div className="stat-label">{label}</div>
        </div>
      ))}
    </div>
  );
}
