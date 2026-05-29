import { useState } from "react";
import type { FormEvent } from "react";
import type { ConnectionStatus } from "../types/ops";

interface SettingsPanelProps {
  status: ConnectionStatus | null;
  isSyncing: boolean;
  statusMessage: string | null;
  onClose: () => void;
  onSaveConnection: (pat: string, workspaceGid: string) => Promise<void>;
  onRunSync: () => Promise<void>;
}

export function SettingsPanel({ status, isSyncing, statusMessage, onClose, onSaveConnection, onRunSync }: SettingsPanelProps) {
  const [pat, setPat] = useState("");
  const [workspaceGid, setWorkspaceGid] = useState(displayWorkspace(status?.workspaceGid));
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSaving(true);
    try {
      await onSaveConnection(pat.trim(), workspaceGid);
      setPat("");
      setMessage("Asana connection saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save Asana connection.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSync() {
    setMessage(null);
    try {
      await onRunSync();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sync Asana data.");
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="settings-modal modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <div>
            <h2 id="settings-title">Asana Connection</h2>
            <span>Server-side PAT storage and sync status</span>
          </div>
          <div className="settings-header-actions">
            <strong className={status?.connected ? "status-good" : "status-warn"}>{status?.connected ? "CONNECTED" : "NOT CONNECTED"}</strong>
            <button className="button" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="settings-status-grid">
          <StatusItem label="Workspace GID" value={displayWorkspace(status?.workspaceGid) || "Auto-detect on sync"} />
          <StatusItem label="Last Updated" value={status?.updatedAt ? new Date(status.updatedAt).toLocaleString() : "Never"} />
          <StatusItem label="Sync State" value={isSyncing ? "Syncing" : statusMessage ?? "Idle"} />
        </div>

        <form className="settings-form" onSubmit={handleSave}>
          <label>
            <span>Personal Access Token</span>
            <input value={pat} onChange={(event) => setPat(event.target.value)} type="password" required placeholder="Paste Asana PAT" />
          </label>
          <label>
            <span>Workspace GID</span>
            <input value={workspaceGid} onChange={(event) => setWorkspaceGid(event.target.value)} placeholder="Optional; .env fallback is supported" />
          </label>
          <div className="settings-actions">
            <button className="button button-accent" disabled={isSaving} type="submit">{isSaving ? "Saving..." : "Save & Validate PAT"}</button>
            <button className="button" disabled={!status?.connected || isSyncing} onClick={handleSync} type="button">{isSyncing ? "Syncing..." : "Run Sync Now"}</button>
          </div>
        </form>

        {(message || statusMessage) && <div className="settings-message">{message ?? statusMessage}</div>}
      </section>
    </div>
  );
}

function displayWorkspace(value: string | null | undefined) {
  if (!value || value.includes("replace-with")) return "";
  return value;
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
