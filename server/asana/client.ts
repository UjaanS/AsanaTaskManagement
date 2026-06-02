import type { AsanaServerConfig } from "./config";
import type { AsanaCustomFieldSetting, AsanaProject, AsanaStory, AsanaTask } from "./types";

const asanaBaseUrl = "https://app.asana.com/api/1.0";
const taskFields = [
  "gid",
  "name",
  "assignee",
  "assignee.name",
  "projects",
  "projects.name",
  "created_at",
  "modified_at",
  "due_on",
  "due_at",
  "completed",
  "completed_at",
  "custom_fields",
  "custom_fields.gid",
  "custom_fields.name",
  "custom_fields.type",
  "custom_fields.display_value",
  "custom_fields.text_value",
  "custom_fields.number_value",
  "custom_fields.date_value",
  "custom_fields.enum_value",
  "custom_fields.enum_value.name",
  "permalink_url",
].join(",");

const storyFields = [
  "gid",
  "text",
  "resource_subtype",
  "created_at",
  "created_by",
  "created_by.name",
].join(",");

const projectFields = ["gid", "name"].join(",");

const customFieldSettingFields = [
  "gid",
  "custom_field",
  "custom_field.gid",
  "custom_field.name",
  "custom_field.type",
  "custom_field.enum_options",
  "custom_field.enum_options.gid",
  "custom_field.enum_options.name",
  "custom_field.enum_options.enabled",
].join(",");

export class AsanaApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "AsanaApiError";
  }

  get safeMessage(): string {
    if (this.status === 401 || this.status === 403) return "Asana authentication failed. Confirm the PAT was copied completely, has not expired or been revoked, and belongs to an account with access to this workspace.";
    if (this.status === 404) return "Asana resource not found. Check ASANA_PROJECT_GIDS and workspace access.";
    if (this.status === 429) return "Asana rate limit reached. Wait briefly, then retry.";
    return `Asana API request failed with status ${this.status}.`;
  }
}

export async function fetchProjectTasks(
  projectGid: string,
  config: AsanaServerConfig,
  options: { modifiedSince?: string } = {},
): Promise<AsanaTask[]> {
  // Asana's /projects/{gid}/tasks supports modified_since (ISO 8601). It does not
  // support a created_since filter, so we use modified_since to bound wire volume
  // (a freshly created task has modified_at == created_at, so this catches them)
  // and rely on normalizeAsanaTasks to enforce the strict created_at window.
  const params = new URLSearchParams({ limit: "100", opt_fields: taskFields });
  if (options.modifiedSince) params.set("modified_since", options.modifiedSince);
  return fetchAll<AsanaTask>(`/projects/${projectGid}/tasks?${params.toString()}`, config);
}

export async function validateAccessToken(accessToken: string): Promise<void> {
  await asanaGet<{ data: { gid: string; name: string } }>("/users/me", { accessToken, projectGids: [], syncLookbackDays: 30, fieldMap: {}, projectNames: {} });
}

export async function fetchWorkspaces(config: AsanaServerConfig): Promise<AsanaProject[]> {
  const json = await asanaGet<{ data: AsanaProject[] }>(`/workspaces?opt_fields=${encodeURIComponent(projectFields)}`, config);
  return json.data ?? [];
}

export async function fetchWorkspaceProjects(workspaceGid: string, config: AsanaServerConfig): Promise<AsanaProject[]> {
  return fetchAll<AsanaProject>(`/projects?workspace=${workspaceGid}&limit=100&opt_fields=${encodeURIComponent(projectFields)}`, config);
}

export async function fetchProjectTaskSample(projectGid: string, config: AsanaServerConfig, limit = 10): Promise<AsanaTask[]> {
  const json = await asanaGet<{ data: AsanaTask[] }>(`/projects/${projectGid}/tasks?limit=${limit}&opt_fields=${encodeURIComponent(taskFields)}`, config);
  return json.data ?? [];
}

export async function fetchProject(projectGid: string, config: AsanaServerConfig): Promise<AsanaProject> {
  const json = await asanaGet<{ data: AsanaProject }>(`/projects/${projectGid}?opt_fields=${encodeURIComponent(projectFields)}`, config);
  return json.data;
}

export async function fetchProjectCustomFieldSettings(projectGid: string, config: AsanaServerConfig): Promise<AsanaCustomFieldSetting[]> {
  return fetchAll<AsanaCustomFieldSetting>(
    `/projects/${projectGid}/custom_field_settings?limit=100&opt_fields=${encodeURIComponent(customFieldSettingFields)}`,
    config,
  );
}

export async function fetchTaskStories(taskGid: string, config: AsanaServerConfig): Promise<AsanaStory[]> {
  try {
    return await fetchAll<AsanaStory>(`/tasks/${taskGid}/stories?limit=100&opt_fields=${encodeURIComponent(storyFields)}`, config);
  } catch (error) {
    console.warn(`Unable to fetch Asana stories for task ${taskGid}:`, error);
    return [];
  }
}

async function fetchAll<T>(path: string, config: AsanaServerConfig): Promise<T[]> {
  const items: T[] = [];
  let nextPath: string | null = path;

  while (nextPath) {
    const json: { data: T[]; next_page?: { uri?: string | null } | null } = await asanaGet(nextPath, config);
    items.push(...(json.data ?? []));
    nextPath = json.next_page?.uri ? json.next_page.uri.replace(asanaBaseUrl, "") : null;
  }

  return items;
}

// Retry policy: 429 (rate limit) and transient 5xx (502/503/504). Exponential
// backoff with jitter, honoring Retry-After when Asana sends it. Bounded so the
// worst case doesn't exceed serverless function timeouts (~25s on Vercel).
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 600;
const MAX_BACKOFF_MS = 4000;
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);

async function asanaGet<T>(path: string, config: AsanaServerConfig): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${asanaBaseUrl}${path}`, {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          Accept: "application/json",
        },
      });
    } catch (networkError) {
      // Network / DNS / connection-refused — retry the transient ones.
      lastError = networkError;
      if (attempt === MAX_ATTEMPTS) throw networkError;
      await sleep(backoffMs(attempt));
      continue;
    }

    if (response.ok) {
      return response.json() as Promise<T>;
    }

    const body = await response.text().catch(() => "");

    if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS) {
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
      const wait = retryAfter ?? backoffMs(attempt);
      console.warn(`Asana ${response.status} for ${path} — retrying in ${wait}ms (attempt ${attempt}/${MAX_ATTEMPTS})`);
      await sleep(wait);
      continue;
    }

    throw new AsanaApiError(response.status, path, `Asana ${response.status} for ${path}: ${body.slice(0, 300)}`);
  }

  // Unreachable, but TS wants a return.
  throw lastError ?? new Error("Asana request failed after retries");
}

function backoffMs(attempt: number): number {
  const expo = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1));
  // Full jitter to avoid thundering herd when several requests are throttled at once.
  return Math.floor(Math.random() * expo);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_BACKOFF_MS, seconds * 1000);
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
