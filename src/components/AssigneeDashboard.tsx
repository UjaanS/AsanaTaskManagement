import { useMemo, useState } from "react";
import { formatShort } from "../lib/date";
import { generateEodReport, groupTasks, sortTasks } from "../lib/ops";
import { flagLabels, phaseClass, phaseLabels } from "../lib/theme";
import type { DerivedTask } from "../types/ops";

interface AssigneeDashboardProps {
  tasks: DerivedTask[];
  order: Record<string, number>;
  onOrderChange: (order: Record<string, number>) => void;
}

export function AssigneeDashboard({ tasks, order, onOrderChange }: AssigneeDashboardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);

  const groups = useMemo(() => groupTasks(tasks, "assignee"), [tasks]);
  const groupNames = Object.keys(groups).sort((a, b) => (a === "Unassigned" ? -1 : b === "Unassigned" ? 1 : a.localeCompare(b)));
  const report = useMemo(() => generateEodReport(tasks), [tasks]);
  const globalStats = useMemo(() => ({
    total: tasks.length,
    overdue: tasks.filter((task) => task.etaStatus === "overdue").length,
    qaFailed: tasks.filter((task) => task.currentPhase === "QA_FAILED" || task.qaReworkCount > 0).length,
    blocked: tasks.filter((task) => task.currentPhase === "ON_HOLD").length,
  }), [tasks]);

  const moveTask = (targetTaskId: string, group: string) => {
    if (!draggedTaskId || draggedTaskId === targetTaskId) return;
    const sorted = sortTasks(groups[group], order);
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

  const copyReport = async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const toggleGroup = (group: string) => {
    setCollapsed((value) => ({ ...value, [group]: !value[group] }));
  };

  return (
    <div className="assignee-dashboard-wrapper">
      <section className="whatsapp-summary">
        <header className="summary-header">
          <div className="summary-header-left">
            <span className="summary-icon">W</span>
            <h3>EOD Status Summary</h3>
          </div>
          <button className="summary-toggle" type="button" onClick={() => setSummaryCollapsed((value) => !value)}>
            {summaryCollapsed ? "Show" : "Hide"}
          </button>
        </header>

        {!summaryCollapsed && (
          <div className="summary-content">
            <div className="summary-stats-row">
              <SummaryStat tone="total" label="Active Tasks" value={globalStats.total} />
              <SummaryStat tone="overdue" label="Overdue" value={globalStats.overdue} alert={globalStats.overdue > 0} />
              <SummaryStat tone="qa-failed" label="QA Issues" value={globalStats.qaFailed} alert={globalStats.qaFailed > 0} />
              <SummaryStat tone="blocked" label="Blocked" value={globalStats.blocked} />
            </div>
            <pre className="summary-preview">{report}</pre>
            <div className="summary-actions">
              <button className="button button-accent" type="button" onClick={copyReport}>
                {copied ? "Copied to Clipboard" : "Copy for WhatsApp"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="assignee-dashboard">
        {groupNames.length === 0 ? (
          <EmptyDashboard />
        ) : (
          groupNames.map((group) => {
            const groupTasks = sortTasks(groups[group], order);
            const isCollapsed = collapsed[group];
            const isUnassigned = group === "Unassigned";
            const counts = {
              blocked: groupTasks.filter((task) => task.currentPhase === "ON_HOLD").length,
              stale: groupTasks.filter((task) => task.attentionFlags.includes("silent_work") || task.attentionFlags.includes("high_priority_stale")).length,
              qaFailed: groupTasks.reduce((sum, task) => sum + task.qaReworkCount, 0),
              eta: groupTasks.filter((task) => task.etaStatus === "overdue").length,
            };

            return (
              <article
                className={`assignee-card ${isUnassigned ? "card-unassigned" : ""} ${counts.eta > 0 ? "card-has-overdue" : ""}`}
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
                  <div className="card-avatar">{isUnassigned ? "?" : group.charAt(0).toUpperCase()}</div>
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

function SummaryStat({ tone, label, value, alert = false }: { tone: string; label: string; value: number; alert?: boolean }) {
  const icon = tone === "total" ? "T" : tone === "overdue" ? "!" : tone === "qa-failed" ? "Q" : "B";
  return (
    <div className="summary-stat">
      <div className={`summary-stat-icon stat-${tone}`}>{icon}</div>
      <div className="summary-stat-info">
        <span className="summary-stat-value" style={{ color: alert ? "var(--red)" : undefined }}>{value}</span>
        <span className="summary-stat-label">{label}</span>
      </div>
    </div>
  );
}

function TaskCompactRow({ task, onDragStart, onDrop }: { task: DerivedTask; onDragStart: () => void; onDrop: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isOverdue = task.etaStatus === "overdue";
  const isQaFailed = task.currentPhase === "QA_FAILED" || task.qaReworkCount > 0;
  const isQaPassed = task.currentPhase === "QA_PASSED";

  return (
    <div
      className={`task-compact ${isOverdue ? "task-overdue" : ""} ${isQaFailed ? "task-qa-failed" : ""} ${isQaPassed ? "task-qa-passed" : ""}`}
      draggable
      onClick={() => setExpanded((value) => !value)}
      onDragOver={(event) => event.preventDefault()}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      <span aria-hidden="true" className="task-grip">::</span>
      <div className="task-main-col">
        <div className="task-title-row">
          <span className="task-id-badge">{task.id}</span>
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
        <span className={`badge-sm badge-phase ${phaseClass[task.currentPhase]}`}>{phaseLabels[task.currentPhase]}</span>
        {task.priority === "Critical" || task.priority === "High" ? (
          <span className={`badge-sm badge-priority-${task.priority.toLowerCase()}`}>{task.priority}</span>
        ) : null}
        {isOverdue && <span className="badge-sm badge-eta-overdue">{task.overdueDays}d late</span>}
        {isQaPassed && <span className="badge-sm badge-qa-passed">Passed</span>}
        {task.qaReworkCount > 0 && !isQaPassed && (
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
        <DetailItem label="Phase" value={phaseLabels[task.currentPhase]} />
        <DetailItem label="Stale" value={`${task.staleDays}d`} />
        <DetailItem label="QA Rework" value={`${task.qaReworkCount}`} />
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
            <span className={`qa-dot phase-dot-${phase.type.toLowerCase().replace("_", "-")}`} />
            <span className="qa-step-title">{phaseLabels[phase.type]}</span>
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
