import type { OpsSummary, ProjectHealth, UserWorkload } from "../types/ops";

export function OpsSnapshot({
  summary,
  projects,
  workloads,
}: {
  summary: OpsSummary | null;
  projects: ProjectHealth[];
  workloads: UserWorkload[];
}) {
  if (!summary && projects.length === 0 && workloads.length === 0) return null;

  const topProject = [...projects].sort((a, b) => b.riskScore - a.riskScore)[0];
  const topWorkload = [...workloads].sort((a, b) => b.active - a.active)[0];

  return (
    <section className="ops-snapshot">
      <SnapshotCard label="Completed Today" value={summary?.completedToday ?? 0} tone="green" />
      <SnapshotCard label="Overdue" value={summary?.overdue ?? 0} tone="red" />
      <SnapshotCard label="New Blockers" value={summary?.newBlockers ?? 0} tone="amber" />
      <SnapshotCard label="High Risk Projects" value={summary?.highRiskProjects ?? 0} tone="orange" />
      <div className="snapshot-wide">
        <span>Highest Risk Project</span>
        <strong>{topProject ? `${topProject.name} (${topProject.healthStatus})` : "No project data"}</strong>
      </div>
      <div className="snapshot-wide">
        <span>Heaviest Workload</span>
        <strong>{topWorkload ? `${topWorkload.name} (${topWorkload.active} active)` : "No workload data"}</strong>
      </div>
      <div className="snapshot-activity">
        <span>Recent Activity</span>
        <strong>{summary?.recentActivity[0]?.title ?? "No recent activity"}</strong>
      </div>
    </section>
  );
}

function SnapshotCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="snapshot-card">
      <strong className={`tone-${tone}`}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
