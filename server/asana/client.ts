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

export async function fetchProjectTasks(projectGid: string, config: AsanaServerConfig): Promise<AsanaTask[]> {
  return fetchAll<AsanaTask>(`/projects/${projectGid}/tasks?limit=100&opt_fields=${encodeURIComponent(taskFields)}`, config);
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

async function asanaGet<T>(path: string, config: AsanaServerConfig): Promise<T> {
  const response = await fetch(`${asanaBaseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new AsanaApiError(response.status, path, `Asana ${response.status} for ${path}: ${body.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}
