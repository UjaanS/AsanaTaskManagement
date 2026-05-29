import type { ConnectionStatus, OpsDataSource, OpsSummary, OpsTask, ProjectHealth, UserWorkload } from "../types/ops";

interface OpsTasksResponse {
  tasks: OpsTask[];
}

export class ApiOpsDataSource implements OpsDataSource {
  async listTasks(): Promise<OpsTask[]> {
    const response = await fetch("/api/ops/tasks");
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(body?.error ?? `Unable to load Asana tasks (${response.status})`);
    }
    const payload = await response.json() as OpsTasksResponse;
    return payload.tasks;
  }
}

export const opsDataSource: OpsDataSource = new ApiOpsDataSource();

async function readApi<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const payload = await response.json().catch(() => null) as { ok?: boolean; data?: T; error?: string } | null;
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `API request failed (${response.status})`);
  }
  return payload?.data as T;
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  return readApi<ConnectionStatus>("/api/auth/pat");
}

export async function saveConnection(pat: string, workspaceGid: string): Promise<void> {
  const response = await fetch("/api/auth/pat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pat, workspaceGid: workspaceGid.trim() || undefined }),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Unable to save Asana PAT (${response.status})`);
  }
}

export async function runSync(): Promise<{ taskCount?: number }> {
  const response = await fetch("/api/sync", { method: "POST" });
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string; taskCount?: number } | null;
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Unable to sync Asana data (${response.status})`);
  }
  return { taskCount: payload?.taskCount };
}

export async function getOpsSummary(): Promise<OpsSummary> {
  return readApi<OpsSummary>("/api/summary");
}

export async function getProjectHealth(): Promise<ProjectHealth[]> {
  return readApi<ProjectHealth[]>("/api/projects");
}

export async function getUserWorkloads(): Promise<UserWorkload[]> {
  return readApi<UserWorkload[]>("/api/users");
}
