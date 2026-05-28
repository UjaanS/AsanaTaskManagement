import { useMemo, useState } from "react";
import { groupTasks, sortTasks } from "../lib/ops";
import type { DerivedTask } from "../types/ops";
import { TaskRow } from "./TaskRow";

interface AssigneeDashboardProps {
  tasks: DerivedTask[];
  order: Record<string, number>;
  onOrderChange: (order: Record<string, number>) => void;
}

export function AssigneeDashboard({ tasks, order, onOrderChange }: AssigneeDashboardProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const groups = useMemo(() => groupTasks(tasks, "assignee"), [tasks]);
  const groupNames = Object.keys(groups).sort((a, b) => (a === "Unassigned" ? -1 : b === "Unassigned" ? 1 : a.localeCompare(b)));

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

  return (
    <section className="assignee-dashboard">
      {groupNames.map((group) => {
        const groupTasks = sortTasks(groups[group], order);
        const isCollapsed = collapsed[group];
        const counts = {
          blocked: groupTasks.filter((task) => task.currentPhase === "ON_HOLD").length,
          stale: groupTasks.filter((task) => task.attentionFlags.includes("silent_work") || task.attentionFlags.includes("high_priority_stale")).length,
          qaFailed: groupTasks.reduce((sum, task) => sum + task.qaReworkCount, 0),
          eta: groupTasks.filter((task) => task.etaStatus === "overdue").length,
        };

        return (
          <div className={`assignee-section ${group === "Unassigned" ? "unassigned-section" : ""}`} key={group}>
            <button
              className="group-header"
              type="button"
              onClick={() => setCollapsed((value) => ({ ...value, [group]: !value[group] }))}
            >
              <span className="chevron">{isCollapsed ? ">" : "v"}</span>
              <span className="group-title">{group}</span>
              <span className="group-count">{groupTasks.length} tasks</span>
              <span className="mini-stat">B {counts.blocked}</span>
              <span className="mini-stat">S {counts.stale}</span>
              <span className="mini-stat">QA {counts.qaFailed}</span>
              <span className="mini-stat danger">ETA {counts.eta}</span>
            </button>
            {!isCollapsed && (
              <div className="group-body">
                {groupTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    draggable
                    onDragStart={(taskId) => setDraggedTaskId(taskId)}
                    onDropTask={(targetTaskId) => moveTask(targetTaskId, group)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
