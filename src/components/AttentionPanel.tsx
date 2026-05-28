import type { AttentionFlag, DerivedTask } from "../types/ops";
import { flagLabels } from "../lib/theme";
import { TaskRow } from "./TaskRow";

const order: AttentionFlag[] = [
  "eta_violation",
  "missing_owner",
  "high_priority_stale",
  "qa_drift",
  "possible_stale_status",
  "missing_status",
  "silent_work",
];

export function AttentionPanel({ tasks }: { tasks: DerivedTask[] }) {
  const flagged = tasks.filter((task) => task.attentionFlags.length > 0);

  return (
    <section className="attention-layout">
      <aside className="attention-summary">
        <h2>Attention Queue</h2>
        <p>{flagged.length} tasks need operational follow-up.</p>
        <div className="attention-counts">
          {order.map((flag) => {
            const count = tasks.filter((task) => task.attentionFlags.includes(flag)).length;
            return (
              <div className="attention-count" key={flag}>
                <span>{flagLabels[flag]}</span>
                <strong>{count}</strong>
              </div>
            );
          })}
        </div>
      </aside>
      <div className="attention-list">
        {flagged.length === 0 ? (
          <div className="empty-state">No operational flags in the current filter set.</div>
        ) : (
          flagged
            .sort((a, b) => b.attentionSignals.length - a.attentionSignals.length || b.modifiedAt.localeCompare(a.modifiedAt))
            .map((task) => <TaskRow key={task.id} task={task} />)
        )}
      </div>
    </section>
  );
}
