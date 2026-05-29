import type { ConnectionStatus, OpsDataSource, OpsTask } from "../types/ops";

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
  const tasks = await opsDataSource.listTasks();
  return { taskCount: tasks.length };
}

export async function clearConnection(): Promise<void> {
  const response = await fetch("/api/auth/pat", { method: "DELETE" });
  const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `Unable to clear Asana session (${response.status})`);
  }
}
