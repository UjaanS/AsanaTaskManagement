import crypto from "node:crypto";

// PhaseKey is the verbatim Asana status string; this Vercel function does not abstract.
type PhaseKey = string;
type Priority = "Critical" | "High" | "Medium" | "Low";

const QA_STATUSES = new Set(["ready for qa", "in qa"]);
const LIVE_STATUSES = new Set(["live on demo"]);
const COMPLETED_PHASE: PhaseKey = "Completed";
const FALLBACK_PHASE: PhaseKey = "New/ To do";

interface SessionPayload {
  pat: string;
  workspaceGid?: string;
  issuedAt?: string;
}

interface AsanaProject {
  gid: string;
  name: string;
}

interface AsanaUserRef {
  gid?: string;
  name?: string;
}

interface AsanaCustomField {
  gid?: string;
  name?: string;
  display_value?: string | null;
  text_value?: string | null;
  number_value?: number | null;
  date_value?: { date?: string | null; date_time?: string | null } | null;
  enum_value?: { name?: string | null } | null;
}

interface AsanaTask {
  gid: string;
  name: string;
  assignee?: AsanaUserRef | null;
  projects?: AsanaProject[];
  created_at?: string;
  modified_at?: string;
  due_on?: string | null;
  due_at?: string | null;
  completed?: boolean;
  completed_at?: string | null;
  custom_fields?: AsanaCustomField[];
  permalink_url?: string;
}

interface OpsTask {
  id: string;
  title: string;
  asanaUrl?: string;
  project: string;
  projectGid?: string;
  assignee: string | null;
  assigneeGid?: string | null;
  createdAt: string;
  modifiedAt: string;
  assignmentDate: string;
  recentlyReassigned?: boolean;
  status: string | null;
  phase: PhaseKey;
  priority: Priority;
  requestType: string;
  qaState?: string | null;
  eta: string | null;
  dueDate?: string | null;
  completedAt?: string | null;
  liveDate?: string | null;
  comments: [];
  latestComment?: undefined;
  phases: Array<{ type: PhaseKey; start: string; end?: string | null }>;
  qaEvents: [];
  sortOrder: number;
}

interface AsanaSessionConfig {
  pat: string;
  workspaceGid?: string;
  projectGids: string[];
  projectNames: Record<string, string>;
  fieldMap: Record<string, Record<string, string | undefined>>;
  syncLookbackDays: number;
}

const asanaBaseUrl = "https://app.asana.com/api/1.0";
const cookieName = "aocc_asana_session";
const autoProjectLimit = 25;
const taskFields = [
  "gid",
  "name",
  "assignee",
  "assignee.gid",
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
  "custom_fields.display_value",
  "custom_fields.text_value",
  "custom_fields.number_value",
  "custom_fields.date_value",
  "custom_fields.enum_value",
  "custom_fields.enum_value.name",
  "permalink_url",
].join(",");

const projectFields = ["gid", "name"].join(",");

export default async function handler(request: any, response: any) {
  console.log("api/ops/tasks route entered");
  console.log("api/ops/tasks method received", request.method);

  try {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      return writeJson(response, 405, { error: "method_not_allowed" });
    }

    const sealedSession = readCookie(request.headers?.cookie, cookieName);
    console.log("api/ops/tasks cookie present", Boolean(sealedSession));
    if (!sealedSession) {
      return writeJson(response, 401, { error: "missing_session" });
    }

    const secret = process.env.APP_SECRET;
    console.log("api/ops/tasks APP_SECRET present", Boolean(secret));
    if (!secret) {
      return writeJson(response, 500, { error: "missing_app_secret" });
    }

    console.log("api/ops/tasks session decrypt started");
    const session = decryptSession(sealedSession, secret);
    if (!session?.pat) {
      console.log("api/ops/tasks session decrypt failure");
      return writeJson(response, 401, { error: "invalid_session" });
    }
    console.log("api/ops/tasks session decrypt success");

    console.log("api/ops/tasks Asana fetch started");
    const config = buildConfig(session);
    const fetched = await fetchAsanaTasks(config);

    console.log("api/ops/tasks task normalization started");
    let tasks: OpsTask[];
    try {
      tasks = normalizeTasks(fetched, config);
      console.log("api/ops/tasks task normalization success");
    } catch (error) {
      console.log("api/ops/tasks task normalization failure");
      console.error("api/ops/tasks normalization failed", safeErrorLog(error));
      return writeJson(response, 500, { error: "task_normalization_failed" });
    }

    return writeJson(response, 200, { tasks });
  } catch (error) {
    console.error("api/ops/tasks failed", safeErrorLog(error));
    return writeJson(response, 502, { error: "asana_fetch_failed" });
  }
}

function decryptSession(value: string, secret: string): SessionPayload | null {
  try {
    const [ivHex, tagHex, encryptedHex] = value.split(":");
    if (!ivHex || !tagHex || !encryptedHex) return null;
    const key = crypto.createHash("sha256").update(secret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(decrypted) as Partial<SessionPayload>;
    return typeof parsed.pat === "string" && parsed.pat ? {
      pat: parsed.pat,
      workspaceGid: sanitizeOptional(parsed.workspaceGid),
      issuedAt: sanitizeOptional(parsed.issuedAt),
    } : null;
  } catch {
    return null;
  }
}

function buildConfig(session: SessionPayload): AsanaSessionConfig {
  return {
    pat: session.pat,
    workspaceGid: sanitizeOptional(session.workspaceGid) ?? sanitizeOptional(process.env.ASANA_WORKSPACE_GID),
    projectGids: parseCsv(process.env.ASANA_PROJECT_GIDS),
    projectNames: parseJsonObject<Record<string, string>>(process.env.ASANA_PROJECT_NAMES_JSON, {}),
    fieldMap: parseJsonObject<Record<string, Record<string, string | undefined>>>(process.env.ASANA_FIELD_MAP_JSON, {}),
    syncLookbackDays: parsePositiveInt(process.env.ASANA_SYNC_LOOKBACK_DAYS, 30),
  };
}

async function fetchAsanaTasks(config: AsanaSessionConfig): Promise<Array<{ task: AsanaTask; projectGid: string; projectName: string }>> {
  const projects = await resolveProjects(config);
  const contexts: Array<{ task: AsanaTask; projectGid: string; projectName: string }> = [];

  for (const project of projects) {
    const tasks = await fetchAll<AsanaTask>(
      `/projects/${encodeURIComponent(project.gid)}/tasks?limit=100&opt_fields=${encodeURIComponent(taskFields)}`,
      config.pat,
    );
    const projectName = config.projectNames[project.gid] ?? project.name;
    tasks.forEach((task) => contexts.push({ task, projectGid: project.gid, projectName }));
  }

  return contexts;
}

async function resolveProjects(config: AsanaSessionConfig): Promise<AsanaProject[]> {
  if (config.projectGids.length > 0) {
    return Promise.all(config.projectGids.map(async (gid) => {
      const project = await asanaGet<{ data: AsanaProject }>(
        `/projects/${encodeURIComponent(gid)}?opt_fields=${encodeURIComponent(projectFields)}`,
        config.pat,
      );
      return { gid, name: config.projectNames[gid] ?? project.data?.name ?? gid };
    }));
  }

  const workspaceGid = config.workspaceGid ?? await resolveFirstWorkspace(config.pat);
  const projects = await fetchAll<AsanaProject>(
    `/projects?workspace=${encodeURIComponent(workspaceGid)}&limit=100&opt_fields=${encodeURIComponent(projectFields)}`,
    config.pat,
  );
  return projects.slice(0, autoProjectLimit);
}

async function resolveFirstWorkspace(pat: string): Promise<string> {
  const workspaces = await fetchAll<AsanaProject>(`/workspaces?limit=100&opt_fields=${encodeURIComponent(projectFields)}`, pat);
  const first = workspaces[0]?.gid;
  if (!first) throw new Error("No Asana workspaces are available for this session.");
  return first;
}

async function fetchAll<T>(path: string, pat: string): Promise<T[]> {
  const items: T[] = [];
  let nextPath: string | null = path;

  while (nextPath) {
    const json: { data?: T[]; next_page?: { uri?: string | null } | null } = await asanaGet(nextPath, pat);
    items.push(...(json.data ?? []));
    nextPath = json.next_page?.uri ? json.next_page.uri.replace(asanaBaseUrl, "") : null;
  }

  return items;
}

async function asanaGet<T>(path: string, pat: string): Promise<T> {
  const response = await fetch(`${asanaBaseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${pat}`,
    },
  });

  console.log("api/ops/tasks Asana response status", response.status);
  if (!response.ok) {
    throw new Error(`Asana request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

function normalizeTasks(items: Array<{ task: AsanaTask; projectGid: string; projectName: string }>, config: AsanaSessionConfig): OpsTask[] {
  const today = todayISO();

  return items
    .map((item, index) => normalizeTask(item, config, today, index))
    .filter((task) => shouldIncludeTask(task, today, config.syncLookbackDays))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

function normalizeTask(item: { task: AsanaTask; projectGid: string; projectName: string }, config: AsanaSessionConfig, today: string, index: number): OpsTask {
  const { task, projectGid } = item;
  const fieldMap = config.fieldMap[projectGid] ?? {};
  const projectName = config.projectNames[projectGid] ?? inferProjectName(task, item.projectName, projectGid);
  const status = getMappedFieldValue(task.custom_fields, fieldMap, "status", ["status", "stage", "task status"]);
  const priorityRaw = getMappedFieldValue(task.custom_fields, fieldMap, "priority", ["priority", "severity"]);
  const requestType = getMappedFieldValue(task.custom_fields, fieldMap, "requestType", ["request type", "type", "ticket type"]) ?? "Unknown";
  const eta = getMappedFieldDate(task.custom_fields, fieldMap, "eta", ["eta", "estimated completion", "target date"]) ?? normalizeDate(task.due_on ?? task.due_at);
  const qaState = getMappedFieldValue(task.custom_fields, fieldMap, "qaState", ["qa state", "qa status", "qa"]);
  const phase = resolvePhase(status, qaState, Boolean(task.completed));
  const createdAt = normalizeDate(task.created_at) ?? today;
  const modifiedAt = normalizeDate(task.modified_at) ?? today;

  return {
    id: task.gid,
    title: task.name,
    asanaUrl: task.permalink_url,
    project: projectName,
    projectGid,
    assignee: task.assignee?.name ?? null,
    assigneeGid: task.assignee?.gid ?? null,
    createdAt,
    modifiedAt,
    assignmentDate: createdAt,
    recentlyReassigned: false,
    status,
    phase,
    priority: normalizePriority(priorityRaw),
    requestType,
    qaState,
    eta,
    dueDate: normalizeDate(task.due_on ?? task.due_at),
    completedAt: normalizeDate(task.completed_at),
    liveDate: LIVE_STATUSES.has(phase.toLowerCase()) ? normalizeDate(task.completed_at ?? task.modified_at) : null,
    comments: [],
    phases: [{ type: phase, start: createdAt, end: null }],
    qaEvents: [],
    sortOrder: index + 1,
  };
}

function getMappedFieldValue(fields: AsanaCustomField[] | undefined, fieldMap: Record<string, string | undefined>, key: string, fallbackNames: string[]): string | null {
  const field = findField(fields, fieldMap[key], fallbackNames);
  return field?.enum_value?.name ?? field?.display_value ?? field?.text_value ?? (field?.number_value !== undefined && field?.number_value !== null ? String(field.number_value) : null);
}

function getMappedFieldDate(fields: AsanaCustomField[] | undefined, fieldMap: Record<string, string | undefined>, key: string, fallbackNames: string[]): string | null {
  const field = findField(fields, fieldMap[key], fallbackNames);
  return normalizeDate(field?.date_value?.date ?? field?.date_value?.date_time) ?? normalizeDate(getMappedFieldValue(fields, fieldMap, key, fallbackNames));
}

function findField(fields: AsanaCustomField[] | undefined, gid: string | undefined, fallbackNames: string[]): AsanaCustomField | undefined {
  if (!fields?.length) return undefined;
  if (gid) {
    const byGid = fields.find((field) => field.gid === gid);
    if (byGid) return byGid;
  }
  return fields.find((field) => fallbackNames.includes((field.name ?? "").trim().toLowerCase()));
}

function resolvePhase(status: string | null, qaState: string | null, completed: boolean): PhaseKey {
  if (completed) return COMPLETED_PHASE;
  if (qaState && QA_STATUSES.has(qaState.trim().toLowerCase())) return qaState.trim();
  return status && status.trim() ? status.trim() : FALLBACK_PHASE;
}

function normalizePriority(value: string | null): Priority {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("critical") || normalized.includes("urgent") || normalized === "p0") return "Critical";
  if (normalized.includes("high") || normalized === "p1") return "High";
  if (normalized.includes("low") || normalized === "p3") return "Low";
  return "Medium";
}

function shouldIncludeTask(task: OpsTask, today: string, lookbackDays: number): boolean {
  return task.createdAt >= "2026-03-01" || task.modifiedAt >= addDays(today, -lookbackDays) || Boolean(task.recentlyReassigned);
}

function inferProjectName(task: AsanaTask, fallback: string, projectGid: string): string {
  return task.projects?.find((project) => project.gid === projectGid)?.name ?? fallback;
}

function readCookie(cookieHeader: string | string[] | undefined, name: string): string | null {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  if (!header) return null;
  const prefix = `${name}=`;
  const cookie = header.split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => sanitizeOptional(item))
    .filter((item): item is string => Boolean(item));
}

function parseJsonObject<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^(replace|your|project_gid|workspace_gid|asana_token|token_here)/i.test(trimmed)) return undefined;
  if (trimmed.includes("replace-with")) return undefined;
  return trimmed;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function writeJson(response: any, status: number, body: unknown) {
  response.status(status).json(body);
}

function safeErrorLog(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "NonError", message: String(error), stack: undefined };
}
