import { useMemo, useState } from "react";
import { groupTasks, sortTasks, generateEodReport } from "../lib/ops";
import { formatShort } from "../lib/date";
import { phaseLabels, phaseClass } from "../lib/theme";
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
  const groupNames = Object.keys(groups).sort((a, b) =>
    a === "Unassigned" ? -1 : b === "Unassigned" ? 1 : a.localeCompare(b)
  );

  // Global stats for summary
  const globalStats = useMemo(() => {
    return {
      total: tasks.length,
      overdue: tasks.filter((t) => t.etaStatus === "overdue").length,
      qaFailed: tasks.filter((t) => t.currentPhase === "QA_FAILED" || t.qaReworkCount > 0).length,
      blocked: tasks.filter((t) => t.currentPhase === "ON_HOLD").length,
    };
  }, [tasks]);

  const report = useMemo(() => generateEodReport(tasks), [tasks]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

  const toggleGroup = (group: string) => {
    setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  return (
    <div className="assignee-dashboard-wrapper">
      {/* WhatsApp Summary Panel */}
      <section className="whatsapp-summary">
        <header className="summary-header">
          <div className="summary-header-left">
            <span className="summary-icon">W</span>
            <h3>EOD Status Summary</h3>
          </div>
          <button
            type="button"
            className="summary-toggle"
            onClick={() => setSummaryCollapsed(!summaryCollapsed)}
          >
            {summaryCollapsed ? "Show" : "Hide"}
          </button>
        </header>

        {!summaryCollapsed && (
          <div className="summary-content">
            <div className="summary-stats-row">
              <div className="summary-stat">
                <div className="summary-stat-icon stat-total">T</div>
                <div className="summary-stat-info">
                  <span className="summary-stat-value">{globalStats.total}</span>
                  <span className="summary-stat-label">Active Tasks</span>
                </div>
              </div>
              <div className="summary-stat">
                <div className="summary-stat-icon stat-overdue">!</div>
                <div className="summary-stat-info">
                  <span className="summary-stat-value" style={{ color: globalStats.overdue > 0 ? "var(--red)" : undefined }}>
                    {globalStats.overdue}
                  </span>
                  <span className="summary-stat-label">Overdue</span>
                </div>
              </div>
              <div className="summary-stat">
                <div className="summary-stat-icon stat-qa-failed">Q</div>
                <div className="summary-stat-info">
                  <span className="summary-stat-value" style={{ color: globalStats.qaFailed > 0 ? "var(--amber)" : undefined }}>
                    {globalStats.qaFailed}
                  </span>
                  <span className="summary-stat-label">QA Issues</span>
                </div>
              </div>
              <div className="summary-stat">
                <div className="summary-stat-icon stat-blocked">B</div>
                <div className="summary-stat-info">
                  <span className="summary-stat-value">{globalStats.blocked}</span>
                  <span className="summary-stat-label">Blocked</span>
                </div>
              </div>
            </div>

            <pre className="summary-preview">{report}</pre>

            <div className="summary-actions">
              <button type="button" className="button button-accent" onClick={handleCopy}>
                {copied ? "Copied to Clipboard" : "Copy for WhatsApp"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Assignee Cards */}
      <section className="assignee-dashboard">
        {groupNames.length === 0 ? (
          <EmptyDashboard />
        ) : (
          groupNames.map((group) => {
            const groupTasksList = sortTasks(groups[group], order);
            const isCollapsed = collapsed[group];
            const isUnassigned = group === "Unassigned";
            const counts = {
              blocked: groupTasksList.filter((t) => t.currentPhase === "ON_HOLD").length,
              stale: groupTasksList.filter(
                (t) => t.attentionFlags.includes("silent_work") || t.attentionFlags.includes("high_priority_stale")
              ).length,
              qaFailed: groupTasksList.reduce((sum, t) => sum + t.qaReworkCount, 0),
              eta: groupTasksList.filter((t) => t.etaStatus === "overdue").length,
            };
            const hasOverdue = counts.eta > 0;

            return (
              <article
                key={group}
                className={`assignee-card ${isUnassigned ? "card-unassigned" : ""} ${hasOverdue ? "card-has-overdue" : ""}`}
              >
                <header
                  className="card-header"
                  onClick={() => toggleGroup(group)}
                  aria-expanded={!isCollapsed}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && toggleGroup(group)}
                >
                  <div className="card-avatar">
                    {isUnassigned ? "?" : group.charAt(0).toUpperCase()}
                  </div>
                  <div className="card-header-info">
                    <div className="card-header-top">
                      <h4 className="card-name">{group}</h4>
                      <span className="card-task-count">
                        {groupTasksList.length} task{groupTasksList.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="card-stats">
                      {counts.blocked > 0 && (
                        <span className="card-stat stat-blocked">
                          {counts.blocked} blocked
                        </span>
                      )}
                      {counts.stale > 0 && (
                        <span className="card-stat stat-stale">
                          {counts.stale} stale
                        </span>
                      )}
                      {counts.qaFailed > 0 && (
                        <span className="card-stat stat-qa">
                          {counts.qaFailed} QA bounce{counts.qaFailed > 1 ? "s" : ""}
                        </span>
                      )}
                      {counts.eta > 0 && (
                        <span className="card-stat stat-eta">
                          {counts.eta} overdue
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="card-chevron">{isCollapsed ? ">" : "v"}</span>
                </header>

                {!isCollapsed && (
                  <div className="card-body">
                    {groupTasksList.length === 0 ? (
                      <div className="card-empty">
                        <div className="card-empty-icon">-</div>
                        <p>No tasks assigned</p>
                      </div>
                    ) : (
                      groupTasksList.map((task) => (
                        <TaskCompactRow
                          key={task.id}
                          task={task}
                          onDragStart={() => setDraggedTaskId(task.id)}
                          onDrop={() => moveTask(task.id, group)}
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

function TaskCompactRow({
  task,
  onDragStart,
  onDrop,
}: {
  task: DerivedTask;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOverdue = task.etaStatus === "overdue";
  const isQaFailed = task.currentPhase === "QA_FAILED" || task.qaReworkCount > 0;
  const isQaPassed = task.currentPhase === "QA_PASSED";

  return (
    <div
      className={`task-compact ${isOverdue ? "task-overdue" : ""} ${isQaFailed ? "task-qa-failed" : ""} ${isQaPassed ? "task-qa-passed" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={() => setExpanded(!expanded)}
    >
      <span className="task-grip" aria-hidden="true">::</span>
      <div className="task-main-col">
        <div className="task-title-row">
          <span className="task-id-badge">{task.id}</span>
          <span className="task-title-text">{task.title}</span>
        </div>
        <div className="task-meta-row">
          <span className="task-project-tag">{task.project}</span>
          <span>ETA: {task.eta ? formatShort(task.eta) : "None"}</span>
          {task.latestComment && (
            <span style={{ opacity: 0.7 }}>
              {task.latestComment.body.slice(0, 40)}
              {task.latestComment.body.length > 40 ? "..." : ""}
            </span>
          )}
        </div>
      </div>
      <div className="task-badges-col">
        <span className={`badge-sm badge-phase ${phaseClass[task.currentPhase]}`}>
          {phaseLabels[task.currentPhase]}
        </span>
        {task.priority === "Critical" || task.priority === "High" ? (
          <span className={`badge-sm badge-priority-${task.priority.toLowerCase()}`}>
            {task.priority}
          </span>
        ) : null}
        {isOverdue && (
          <span className="badge-sm badge-eta-overdue">
            {task.overdueDays}d late
          </span>
        )}
        {isQaPassed && (
          <span className="badge-sm badge-qa-passed">Passed</span>
        )}
        {task.qaReworkCount > 0 && !isQaPassed && (
          <span className="badge-sm badge-qa-failed">
            {task.qaReworkCount} bounce{task.qaReworkCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {expanded && (
        <TaskExpandedDetails task={task} />
      )}
    </div>
  );
}

function TaskExpandedDetails({ task }: { task: DerivedTask }) {
  return (
    <div className="task-detail" onClick={(e) => e.stopPropagation()}>
      <div className="detail-grid">
        <DetailItem label="Created" value={formatShort(task.createdAt)} />
        <DetailItem label="Assigned" value={formatShort(task.assignmentDate)} />
        <DetailItem label="Status" value={task.status ?? "Missing"} />
        <DetailItem label="Phase" value={phaseLabels[task.currentPhase]} />
        <DetailItem label="Stale" value={`${task.staleDays}d`} />
        <DetailItem label="QA Rework" value={`${task.qaReworkCount}`} />
      </div>
      <div className="qa-timeline">
        {task.phases.map((phase, idx) => (
          <div className="qa-step" key={`${phase.type}-${phase.start}-${idx}`}>
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
      <div className="card-empty" style={{ padding: "48px 24px" }}>
        <div className="card-empty-icon" style={{ fontSize: "32px" }}>-</div>
        <p style={{ fontSize: "14px", marginTop: "12px" }}>No tasks match your filters</p>
        <p style={{ fontSize: "11px", color: "var(--faint)", marginTop: "4px" }}>
          Try adjusting the filters above to see tasks
        </p>
      </div>
    </div>
  );
}
