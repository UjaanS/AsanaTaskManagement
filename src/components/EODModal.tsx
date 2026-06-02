import { useMemo, useState } from "react";
import { buildEodReport, generateEodReport } from "../lib/ops";
import { avatarColor, initials, phaseClass } from "../lib/theme";
import type { EodItem } from "../lib/ops";
import type { DerivedTask } from "../types/ops";

interface EODModalProps {
  tasks: DerivedTask[];
  onClose: () => void;
}

export function EODModal({ tasks, onClose }: EODModalProps) {
  const [copied, setCopied] = useState(false);
  const report = useMemo(() => buildEodReport(tasks), [tasks]);

  const copy = async () => {
    // Modal is the new visual; the copied text stays in the original plain-text
    // format the team pastes into WhatsApp.
    await navigator.clipboard.writeText(generateEodReport(tasks));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const riskChips = [
    { key: "overdue", icon: "🔴", label: "Overdue", value: report.risk.overdue, tone: "overdue" },
    { key: "qa", icon: "🧪", label: report.risk.qaRejections === 1 ? "QA Rejection" : "QA Rejections", value: report.risk.qaRejections, tone: "qa" },
    { key: "review", icon: "⚠️", label: "Need Review", value: report.risk.needsReview, tone: "review" },
    { key: "blocked", icon: "⛔", label: "Blocked", value: report.risk.blocked, tone: "blocked" },
  ].filter((chip) => chip.value > 0);

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal eod-modal">
        <header className="modal-header">
          <div>
            <h2>Operations Update</h2>
            <span>{report.dateLabel} · ready to share on WhatsApp</span>
          </div>
          <div className="modal-actions">
            <button className="button button-accent" type="button" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</button>
            <button className="button" type="button" onClick={onClose}>Close</button>
          </div>
        </header>

        <div className="eod-body">
          <div className="eod-risk-strip" role="status" aria-label="At a glance">
            {riskChips.length === 0 ? (
              <span className="eod-risk-chip tone-ok">✅ Nothing at risk</span>
            ) : (
              riskChips.map((chip) => (
                <span key={chip.key} className={`eod-risk-chip tone-${chip.tone}`}>
                  <span aria-hidden="true">{chip.icon}</span>
                  <strong>{chip.value}</strong>
                  {chip.label}
                </span>
              ))
            )}
          </div>

          <div className="eod-totals">
            <span><strong className="mono">{report.totals.active}</strong> Active</span>
            <span><strong className="mono">{report.totals.inQa}</strong> In QA</span>
          </div>

          {report.groups.length === 0 ? (
            <div className="eod-empty">No updates to report today.</div>
          ) : (
            <div className="eod-groups">
              {report.groups.map((group) => {
                const color = avatarColor(group.assignee);
                return (
                  <section className="eod-group" key={group.assignee}>
                    <header className="eod-group-header">
                      <span className="eod-avatar" style={{ background: color.bg, color: color.fg }}>
                        {initials(group.assignee)}
                      </span>
                      <span className="eod-group-name">{group.assignee}</span>
                      <span className="eod-count-pill">{group.taskCount}</span>
                    </header>
                    <ol className="eod-items">
                      {group.items.map((item) => (
                        <li className="eod-item" key={item.id}>
                          <span className="eod-item-title">{item.title}</span>
                          <span className={`badge-sm badge-phase ${phaseClass(item.phase)}`}>{item.phase}</span>
                          <ItemBadges item={item} />
                          {item.action && <span className="eod-item-action">{item.action}</span>}
                        </li>
                      ))}
                    </ol>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function ItemBadges({ item }: { item: EodItem }) {
  return (
    <>
      {item.etaOverdue && <span className="badge-sm badge-eta-overdue">{item.overdueDays}d late</span>}
      {item.qaReworkCount > 0 && <span className="badge-sm badge-qa-failed">{item.qaReworkCount} bounce{item.qaReworkCount > 1 ? "es" : ""}</span>}
      {item.blocked && <span className="badge-sm badge-blocked">Blocked</span>}
    </>
  );
}
