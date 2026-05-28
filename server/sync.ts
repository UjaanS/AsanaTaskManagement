import type { AsanaServerConfig } from "./asana/config";
import { AsanaConfigError, readAsanaEnv } from "./asana/config";
import { fetchOpsTasks } from "./asana/service";
import { getDb } from "./db";
import { persistOpsTasks } from "./persistence/tasks";
import { decryptSecret, requireAppSecret } from "./security";
import crypto from "node:crypto";

export async function runSync() {
  const start = Date.now();
  const syncRunId = crypto.randomUUID();
  getDb().prepare("INSERT INTO sync_runs (id, status, started_at) VALUES (?, ?, ?)").run(syncRunId, "running", new Date().toISOString());

  try {
    const config = await loadPersistentAsanaConfig();
    const tasks = await fetchOpsTasks(config);
    await persistOpsTasks(tasks);
    getDb()
      .prepare("UPDATE sync_runs SET status = ?, finished_at = ?, duration_ms = ? WHERE id = ?")
      .run("success", new Date().toISOString(), Date.now() - start, syncRunId);
    return { ok: true, taskCount: tasks.length };
  } catch (error) {
    getDb()
      .prepare("UPDATE sync_runs SET status = ?, finished_at = ?, duration_ms = ?, error_message = ? WHERE id = ?")
      .run("failed", new Date().toISOString(), Date.now() - start, error instanceof Error ? error.message : "Unknown sync error", syncRunId);
    throw error;
  }
}

export async function loadPersistentAsanaConfig(env: NodeJS.ProcessEnv = process.env): Promise<AsanaServerConfig> {
  const snapshot = readAsanaEnv(env);
  const integrationConfig = getDb()
    .prepare("SELECT pat_cipher_text, workspace_gid FROM integration_config ORDER BY updated_at DESC LIMIT 1")
    .get() as { pat_cipher_text?: string | null; workspace_gid?: string | null } | undefined;
  const accessToken = integrationConfig?.pat_cipher_text
    ? decryptSecret(integrationConfig.pat_cipher_text, requireAppSecret(env))
    : env.ASANA_ACCESS_TOKEN;

  if (!accessToken) {
    throw new AsanaConfigError("Missing Asana PAT. Save one in Settings or set ASANA_ACCESS_TOKEN server-side in .env.");
  }

  if (snapshot.projectGids.length === 0) {
    throw new AsanaConfigError("Missing ASANA_PROJECT_GIDS. Provide one or more comma-separated Asana project GIDs.");
  }

  if (snapshot.warnings.length > 0) {
    throw new AsanaConfigError(snapshot.warnings[0]);
  }

  return {
    accessToken,
    workspaceGid: integrationConfig?.workspace_gid ?? snapshot.workspaceGid,
    projectGids: snapshot.projectGids,
    syncLookbackDays: snapshot.syncLookbackDays,
    fieldMap: snapshot.fieldMap,
    projectNames: snapshot.projectNames,
    statusToPhase: snapshot.statusToPhase,
  };
}
