import { useState } from "react";
import { formatShort } from "../lib/date";
import { phaseDotClass, phaseLabel } from "../lib/theme";
import type { DerivedTask } from "../types/ops";
import { EtaBadge, FlagBadge, PhaseBadge, PriorityBadge } from "./Badge";

interface TaskRowProps {
  task: DerivedTask;
  draggable?: boolean;
  onDragStart?: (taskId: string) => void;
  onDropTask?: (targetTaskId: string) => void;
}

export function TaskRow({ task, draggable = false, onDragStart, onDropTask }: TaskRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className={`task-row ${!task.assignee ? "task-row-unassigned" : ""} ${task.etaStatus === "overdue" ? "task-row-overdue" : ""}`}
      draggable={draggable}
      onDragStart={() => onDragStart?.(task.id)}
      onDragOver={(event) => draggable && event.preventDefault()}
      onDrop={() => onDropTask?.(task.id)}
    >
      <button className="task-main" type="button" onClick={() => setOpen((value) => !value)}>
        <span className="drag-handle" aria-hidden="true">::</span>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">{task.project}</span>
        <PhaseBadge phase={task.currentPhase} />
        <PriorityBadge priority={task.priority} />
        <EtaBadge status={task.etaStatus} overdueDays={task.overdueDays} />
        {task.qaReworkCount > 0 && <span className="badge qa-bounce">{task.qaReworkCount} QA bounce{task.qaReworkCount > 1 ? "es" : ""}</span>}
      </button>

      <div className="task-subline">
        <span>ETA {task.eta ? formatShort(task.eta) : "missing"}</span>
        {task.latestComment && (
          <span className="task-latest-comment">
            {task.latestComment.body.slice(0, 64)}
            {task.latestComment.body.length > 64 ? "..." : ""}
          </span>
        )}
      </div>

      {task.attentionFlags.length > 0 && (
        <div className="flag-line">
          {task.attentionSignals.map((signal) => <FlagBadge key={signal.flag} signal={signal} />)}
        </div>
      )}

      {open && (
        <div className="task-detail">
          <div className="detail-grid">
            <Detail label="Created" value={formatShort(task.createdAt)} />
            <Detail label="Assigned" value={formatShort(task.assignmentDate)} />
            <Detail label="Status" value={task.status ?? "Missing"} />
            <Detail label="Stale" value={`${task.staleDays}d since update`} />
            <Detail label="QA bounces" value={`${task.qaReworkCount}`} />
          </div>
          <div className="qa-timeline">
            {task.phases.map((phase, index) => (
              <div className="qa-step" key={`${phase.type}-${phase.start}-${index}`}>
                <span className={`qa-dot ${phaseDotClass(phase.type)}`} />
                <span className="qa-step-title">{phaseLabel(phase.type)}</span>
                <span className="qa-step-date">{formatShort(phase.start)}{phase.end ? ` -> ${formatShort(phase.end)}` : " -> ongoing"}</span>
                {phase.tester && <span className="qa-step-muted">by {phase.tester}</span>}
                {phase.reason && <span className="qa-reason">{phase.reason}</span>}
              </div>
            ))}
          </div>
          {task.attentionSignals.length > 0 && (
            <div className="signal-panel">
              {task.attentionSignals.map((signal) => (
                <div className={`signal-card severity-${signal.severity}`} key={signal.flag}>
                  <strong>{signal.reason}</strong>
                  <span>{signal.action}</span>
                  <em>{signal.source}{signal.ageDays !== undefined ? ` | ${signal.ageDays}d` : ""}</em>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
