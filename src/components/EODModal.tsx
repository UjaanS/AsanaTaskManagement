import { useMemo, useState } from "react";
import { generateEodReport } from "../lib/ops";
import type { DerivedTask } from "../types/ops";

interface EODModalProps {
  tasks: DerivedTask[];
  onClose: () => void;
}

export function EODModal({ tasks, onClose }: EODModalProps) {
  const [copied, setCopied] = useState(false);
  const report = useMemo(() => generateEodReport(tasks), [tasks]);

  const copy = async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="modal-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal">
        <header className="modal-header">
          <div>
            <h2>EOD Report</h2>
            <span>WhatsApp-ready operational summary</span>
          </div>
          <div className="modal-actions">
            <button className="button button-accent" type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            <button className="button" type="button" onClick={onClose}>Close</button>
          </div>
        </header>
        <pre className="report-preview">{report}</pre>
      </section>
    </div>
  );
}
