import { useMemo, useState } from "react";
import { groupTasks, sortTasksByRisk } from "../lib/ops";
import { opsConfig } from "../lib/opsConfig";
import { avatarColor, initials, phaseClass, phaseDotClass, phaseLabel } from "../lib/theme";
import { formatShort } from "../lib/date";
import { flagLabels } from "../lib/theme";
import type { DerivedTask } from "../types/ops";

interface AssigneeDashboardProps {
  tasks: DerivedTask[];
  order: Record<string, number>;
  onOrderChange: (order: Record<string, number>) => void;
}

type Health = "red" | "amber" | "green";

interface GroupSummary {
  name: string;
  isUnassigned: boolean;
  tasks: DerivedTask[];
  activeCount: number;
  counts: { blocked: number; stale: number; qaFailed: number; eta: number };
  hasAttention: boolean;
  health: Health;
}

export function AssigneeDashboard({ tasks, order, onOrderChange }: AssigneeDashboardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);

  const groups = useMemo(() => groupTasks(tasks, "assignee"), [tasks]);

  // Build a summary per assignee, then order cards by workload (most active
  // tasks first). Tasks within each card are risk-ordered (overdue/QA/blocked
  // first) while still honouring any manual drag order.
  const orderedGroups = useMemo<GroupSummary[]>(() => {
    return Object.keys(groups)
      .map((name) => {
        const groupTasks = sortTasksByRisk(groups[name], order);
        const counts = {
          blocked: groupTasks.filter((task) => opsConfig.isOnHold(task.currentPhase)).length,
          stale: groupTasks.filter((task) => task.attentionFlags.includes("silent_work") || task.attentionFlags.includes("high_priority_stale")).length,
          qaFailed: groupTasks.reduce((sum, task) => sum + task.qaReworkCount, 0),
          eta: groupTasks.filter((task) => task.etaStatus === "overdue").length,
        };
        const activeCount = groupTasks.filter((task) => !opsConfig.isClosed(task.currentPhase) && !task.completedAt).length;
        const anyFlag = groupTasks.some((task) => task.attentionFlags.length > 0);
        const hasAttention = counts.eta > 0 || counts.qaFailed > 0 || counts.blocked > 0 || counts.stale > 0 || anyFlag;
        const health: Health =
          counts.eta > 0 || counts.qaFailed > 0 || counts.blocked > 0 ? "red" : counts.stale > 0 || anyFlag ? "amber" : "green";
        return { name, isUnassigned: name === "Unassigned", tasks: groupTasks, activeCount, counts, hasAttention, health };
      })
      .sort((a, b) => b.activeCount - a.activeCount || a.name.localeCompare(b.name));
  }, [groups, order]);

  const moveTask = (targetTaskId: string, group: string) => {
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;
    const sorted = sortTasksByRisk(groups[group], order);
    const from = sorted.findIndex((task) => task.id === draggedTaskId);
    const to = sorted.findIndex((task) => task.id === targetTaskId);
    if (from < 0 || to < 0) return;
    const next = [...sorted];
    const [moving] = next.splice(from, 1);
    next.splice(to, 0, moving);
    onOrderChange({
      ...order,
      ...Object.fromEntries(next.map((task, index) => [task.id, index + 1])),
    });
    setDraggedTaskId(null);
  };

  const toggleGroup = (group: string) => {
    setCollapsed((value) => ({ ...value, [group]: !value[group] }));
  };

  const setAll = (value: boolean) => {
    setCollapsed(Object.fromEntries(orderedGroups.map((g) => [g.name, value])));
  };

  return (
    <div className="assignee-dashboard-wrapper">
      {orderedGroups.length > 0 && (
        <div className="assignee-toolbar">
          <span className="assignee-toolbar-label">{orderedGroups.length} {orderedGroups.length === 1 ? "person" : "people"}</span>
          <div className="assignee-toolbar-actions">
            <button type="button" className="button" onClick={() => setAll(false)}>Expand all</button>
            <button type="button" className="button" onClick={() => setAll(true)}>Collapse all</button>
          </div>
        </div>
      )}
      <section className="assignee-dashboard">
        {orderedGroups.length === 0 ? (
          <EmptyDashboard />
        ) : (
          orderedGroups.map(({ name: group, isUnassigned, tasks: groupTasks, counts, hasAttention, health }) => {
            // Calm people (no attention) start collapsed; a manual toggle overrides.
            const isCollapsed = collapsed[group] ?? !hasAttention;
            const color = avatarColor(group);

            return (
              <article
                className={`assignee-card card-health-${health} ${isUnassigned ? "card-unassigned" : ""}`}
                key={group}
              >
                <header
                  aria-expanded={!isCollapsed}
                  className="card-header"
                  onClick={() => toggleGroup(group)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") toggleGroup(group);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div
                    className="card-avatar"
                    style={isUnassigned ? undefined : { background: color.bg, color: color.fg }}
                  >
                    {isUnassigned ? "?" : initials(group)}
                  </div>
                  <div className="card-header-info">
                    <div className="card-header-top">
                      <h4 className="card-name">{group}</h4>
                      <span className="card-task-count">{groupTasks.length} task{groupTasks.length === 1 ? "" : "s"}</span>
                    </div>
                    <div className="card-stats">
                      {counts.blocked > 0 && <span className="card-stat stat-blocked">{counts.blocked} blocked</span>}
                      {counts.stale > 0 && <span className="card-stat stat-stale">{counts.stale} stale</span>}
                      {counts.qaFailed > 0 && <span className="card-stat stat-qa">{counts.qaFailed} QA bounce{counts.qaFailed > 1 ? "s" : ""}</span>}
                      {counts.eta > 0 && <span className="card-stat stat-eta">{counts.eta} overdue</span>}
                    </div>
                  </div>
                  <span className="card-chevron">{isCollapsed ? ">" : "v"}</span>
                </header>

                {!isCollapsed && (
                  <div className="card-body">
                    {groupTasks.length === 0 ? (
                      <div className="card-empty">
                        <div className="card-empty-icon">-</div>
                        <p>No tasks assigned</p>
                      </div>
                    ) : (
                      groupTasks.map((task) => (
                        <TaskCompactRow
                          key={task.id}
                          onDragStart={() => setDraggedTaskId(task.id)}
                          onDrop={() => moveTask(task.id, group)}
                          task={task}
                        />
                      ))
                    )}
                  </div>
                )}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

function TaskCompactRow({ task, onDragStart, onDrop }: { task: DerivedTask; onDragStart: () => void; onDrop: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isOverdue = task.etaStatus === "overdue";
  const isQaFailed = task.qaReworkCount > 0;

  return (
    <div
      className={`task-compact ${isOverdue ? "task-overdue" : ""} ${isQaFailed ? "task-qa-failed" : ""}`}
      draggable
      onClick={() => setExpanded((value) => !value)}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      <span aria-hidden="true" className="task-grip">::</span>
      <div className="task-main-col">
        <div className="task-title-row">
          <span className="task-title-text">{task.title}</span>
        </div>
        <div className="task-meta-row">
          <span className="task-project-tag">{task.project}</span>
          <span>ETA: {task.eta ? formatShort(task.eta) : "None"}</span>
          {task.latestComment && (
            <span className="task-latest-comment">
              {task.latestComment.body.slice(0, 44)}
              {task.latestComment.body.length > 44 ? "..." : ""}
            </span>
          )}
        </div>
      </div>
      <div className="task-badges-col">
        <span className={`badge-sm badge-phase ${phaseClass(task.currentPhase)}`}>{phaseLabel(task.currentPhase)}</span>
        {task.priority === "Critical" || task.priority === "High" ? (
          <span className={`badge-sm badge-priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
        ) : null}
        {isOverdue && <span className="badge-sm badge-eta-overdue">{task.overdueDays}d late</span>}
        {isQaFailed && (
          <span className="badge-sm badge-qa-failed">{task.qaReworkCount} bounce{task.qaReworkCount > 1 ? "s" : ""}</span>
        )}
      </div>

      {expanded && <TaskExpandedDetails task={task} />}
    </div>
  );
}

function TaskExpandedDetails({ task }: { task: DerivedTask }) {
  return (
    <div className="task-detail task-compact-detail" onClick={(event) => event.stopPropagation()}>
      <div className="detail-grid">
        <DetailItem label="Created" value={formatShort(task.createdAt)} />
        <DetailItem label="Assigned" value={formatShort(task.assignmentDate)} />
        <DetailItem label="Status" value={task.status ?? "Missing"} />
        <DetailItem label="Stale" value={`${task.staleDays}d`} />
        <DetailItem label="QA bounces" value={`${task.qaReworkCount}`} />
      </div>

      {task.attentionSignals.length > 0 && (
        <div className="signal-panel">
          {task.attentionSignals.map((signal) => (
            <div className={`signal-card severity-${signal.severity}`} key={signal.flag}>
              <strong>{flagLabels[signal.flag]}</strong>
              <span>{signal.reason}</span>
              <em>{signal.action}</em>
            </div>
          ))}
        </div>
      )}

      <div className="qa-timeline">
        {task.phases.map((phase, index) => (
          <div className="qa-step" key={`${phase.type}-${phase.start}-${index}`}>
            <span className={`qa-dot ${phaseDotClass(phase.type)}`} />
            <span className="qa-step-title">{phaseLabel(phase.type)}</span>
            <span className="qa-step-date">
              {formatShort(phase.start)}
              {phase.end ? ` -> ${formatShort(phase.end)}` : " -> ongoing"}
            </span>
            {phase.tester && <span className="qa-step-muted">by {phase.tester}</span>}
            {phase.reason && <span className="qa-reason">{phase.reason}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyDashboard() {
  return (
    <div className="assignee-card">
      <div className="card-empty large-empty">
        <div className="card-empty-icon">-</div>
        <p>No tasks match your filters</p>
        <p>Try adjusting filters or enabling Show Old.</p>
      </div>
    </div>
  );
}
