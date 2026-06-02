import crypto from "node:crypto";
import type { OpsTask } from "../../src/types/ops";
import { opsConfig } from "../../src/lib/opsConfig";
import { getDb, rowToBool, rowToDate, type TaskRecord } from "../db";
import { calculateTaskRisk } from "../insights/etaRisk";
import { shouldEscalate } from "../insights/escalation";
import { computeProjectHealth } from "../insights/projectHealth";
import { staleSeverity } from "../insights/staleDetection";

export interface TaskDto {
  id: string;
  title: string;
  assignee: string;
  status: string;
  priority: string;
  dueDate: string | null;
  project: string;
  blocked: boolean;
  stale: ReturnType<typeof staleSeverity>;
  risk: ReturnType<typeof calculateTaskRisk>;
  escalation: boolean;
}

export async function persistOpsTasks(tasks: OpsTask[]) {
  const db = getDb();
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    for (const task of tasks) {
      const assigneeId = task.assigneeGid ? upsertUser(task.assigneeGid, task.assignee ?? "Unassigned", now) : null;
      const projectId = upsertProject(task.projectGid ?? task.project, task.project, now);
      const completed = Boolean(task.completedAt) || opsConfig.isClosed(task.phase);
      const blocked = opsConfig.isOnHold(task.phase) || /block/i.test(task.status ?? "");
      const existing = db.prepare("SELECT id FROM tasks WHERE asana_gid = ?").get(task.id) as { id: string } | undefined;
      const taskId = existing?.id ?? crypto.randomUUID();
      const values = {
        id: taskId,
        asanaGid: task.id,
        title: task.title,
        status: task.status ?? "Unknown",
        phase: task.phase,
        priority: task.priority,
        requestType: task.requestType,
        dueDate: toIso(parseDate(task.dueDate)),
        eta: toIso(parseDate(task.eta)),
        completed: completed ? 1 : 0,
        blocked: blocked ? 1 : 0,
        tags: JSON.stringify([]),
        opsJson: JSON.stringify(task),
        lastUpdated: toIso(parseDate(task.modifiedAt)) ?? now,
        now,
        assigneeId,
        projectId,
      };

      if (existing) {
        db.prepare(`
          UPDATE tasks
          SET title = ?, status = ?, phase = ?, priority = ?, request_type = ?, due_date = ?, eta = ?,
              completed = ?, blocked = ?, tags = ?, ops_json = ?, last_updated = ?, updated_at = ?,
              assignee_id = ?, project_id = ?
          WHERE id = ?
        `).run(
          values.title,
          values.status,
          values.phase,
          values.priority,
          values.requestType,
          values.dueDate,
          values.eta,
          values.completed,
          values.blocked,
          values.tags,
          values.opsJson,
          values.lastUpdated,
          now,
          values.assigneeId,
          values.projectId,
          values.id,
        );
      } else {
        db.prepare(`
          INSERT INTO tasks (
            id, asana_gid, title, status, phase, priority, request_type, due_date, eta, completed,
            blocked, tags, ops_json, last_updated, created_at, updated_at, assignee_id, project_id
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          values.id,
          values.asanaGid,
          values.title,
          values.status,
          values.phase,
          values.priority,
          values.requestType,
          values.dueDate,
          values.eta,
          values.completed,
          values.blocked,
          values.tags,
          values.opsJson,
          values.lastUpdated,
          now,
          now,
          values.assigneeId,
          values.projectId,
        );
      }

      db.prepare("INSERT INTO task_events (id, task_id, type, payload, created_at) VALUES (?, ?, ?, ?, ?)").run(
        crypto.randomUUID(),
        taskId,
        completed ? "completed" : blocked ? "blocked" : "updated",
        JSON.stringify({ title: task.title, updatedAt: values.lastUpdated }),
        now,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function listPersistedOpsTasks(): Promise<OpsTask[]> {
  const rows = getDb().prepare("SELECT ops_json FROM tasks ORDER BY last_updated DESC").all() as Array<{ ops_json: string }>;
  return rows.map((row) => JSON.parse(row.ops_json) as OpsTask);
}

export async function listTaskDtos(filters: URLSearchParams): Promise<TaskDto[]> {
  let data = getTaskRecords().map(serializeTask);
  const assignee = filters.get("assignee");
  const project = filters.get("project");
  const overdue = filters.get("overdue");
  const blocked = filters.get("blocked");

  if (assignee) data = data.filter((task) => task.assignee === assignee);
  if (project) data = data.filter((task) => task.project === project);
  if (overdue === "true") data = data.filter((task) => task.dueDate && new Date(task.dueDate) < new Date());
  if (blocked === "true") data = data.filter((task) => task.blocked);
  return data;
}

export async function listProjectHealth() {
  const db = getDb();
  const projects = db.prepare("SELECT id, name FROM projects ORDER BY name ASC").all() as Array<{ id: string; name: string }>;
  const now = new Date().toISOString();

  return projects.map((project) => {
    const tasks = getTaskRecords("WHERE t.project_id = ?", [project.id]);
    const activeTasks = tasks.filter((task) => !task.completed);
    const total = tasks.length;
    const completed = tasks.filter((task) => task.completed).length;
    const overdue = activeTasks.filter((task) => task.dueDate && task.dueDate < new Date()).length;
    const blockers = activeTasks.filter((task) => task.blocked).length;
    const nextDeadline = activeTasks
      .filter((task) => task.dueDate)
      .sort((a, b) => (a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER))[0]
      ?.dueDate;
    const completionPct = total === 0 ? 0 : Number(((completed / total) * 100).toFixed(1));
    const health = computeProjectHealth({ completionPct, overdueCount: overdue, blockerCount: blockers, totalCount: total });

    db.prepare(`
      INSERT INTO project_health_snapshots
      (id, project_id, completion_pct, overdue_count, blocker_count, risk_score, health_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), project.id, completionPct, overdue, blockers, health.riskScore, health.status, now);

    return {
      id: project.id,
      name: project.name,
      completionPct,
      overdueCount: overdue,
      blockerCount: blockers,
      riskScore: health.riskScore,
      healthStatus: health.status,
      nextDeadline: nextDeadline?.toISOString() ?? null,
    };
  });
}

export async function listUserWorkloads() {
  const users = getDb().prepare("SELECT id, name FROM users ORDER BY name ASC").all() as Array<{ id: string; name: string }>;
  return users.map((user) => {
    const tasks = getTaskRecords("WHERE t.assignee_id = ?", [user.id]);
    const activeTasks = tasks.filter((task) => !task.completed);
    return {
      name: user.name,
      active: activeTasks.length,
      overdue: activeTasks.filter((task) => task.dueDate && task.dueDate < new Date()).length,
      blocked: activeTasks.filter((task) => task.blocked).length,
      stale: activeTasks.filter((task) => staleSeverity(task.lastUpdated) !== "fresh").length,
      completion: tasks.length === 0 ? 0 : Number(((tasks.filter((task) => task.completed).length / tasks.length) * 100).toFixed(1)),
    };
  });
}

export async function getSummary() {
  const tasks = getTaskRecords();
  const events = getDb().prepare("SELECT id, type, payload, created_at FROM task_events ORDER BY created_at DESC LIMIT 20").all() as Array<{
    id: string;
    type: string;
    payload: string;
    created_at: string;
  }>;
  const projectRows = getDb().prepare("SELECT id FROM projects").all() as Array<{ id: string }>;

  const completedToday = tasks.filter((task) => task.completed && sameDay(task.lastUpdated, new Date())).length;
  const overdue = tasks.filter((task) => !task.completed && task.dueDate && task.dueDate < new Date()).length;
  const newBlockers = events.filter((event) => event.type === "blocked" && Date.now() - new Date(event.created_at).getTime() < 86_400_000).length;
  const highRiskProjects = projectRows.filter((project) => {
    const projectTasks = getTaskRecords("WHERE t.project_id = ?", [project.id]);
    const total = projectTasks.length;
    const completed = projectTasks.filter((task) => task.completed).length;
    const completionPct = total === 0 ? 0 : (completed / total) * 100;
    const overdueCount = projectTasks.filter((task) => task.dueDate && task.dueDate < new Date() && !task.completed).length;
    const blockerCount = projectTasks.filter((task) => task.blocked && !task.completed).length;
    return computeProjectHealth({ completionPct, overdueCount, blockerCount, totalCount: total }).status === "red";
  }).length;

  return {
    completedToday,
    overdue,
    newBlockers,
    highRiskProjects,
    recentActivity: events.map((event) => {
      const payload = JSON.parse(event.payload) as { title?: string };
      return { id: event.id, type: event.type, title: payload.title ?? "Untitled task", createdAt: event.created_at };
    }),
  };
}

export async function getLastSyncAt(): Promise<string | null> {
  const row = getDb()
    .prepare("SELECT finished_at FROM sync_runs WHERE status = 'success' AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1")
    .get() as { finished_at: string } | undefined;
  return row?.finished_at ?? null;
}

function upsertUser(asanaGid: string, name: string, now: string): string {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE asana_gid = ?").get(asanaGid) as { id: string } | undefined;
  if (existing) {
    db.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?").run(name, now, existing.id);
    return existing.id;
  }
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO users (id, asana_gid, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, asanaGid, name, now, now);
  return id;
}

function upsertProject(asanaGid: string, name: string, now: string): string {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM projects WHERE asana_gid = ?").get(asanaGid) as { id: string } | undefined;
  if (existing) {
    db.prepare("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?").run(name, now, existing.id);
    return existing.id;
  }
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO projects (id, asana_gid, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, asanaGid, name, now, now);
  return id;
}

function getTaskRecords(where = "", params: unknown[] = []): TaskRecord[] {
  const rows = getDb().prepare(`
    SELECT
      t.id, t.asana_gid, t.title, t.status, t.phase, t.priority, t.request_type, t.due_date,
      t.eta, t.completed, t.blocked, t.tags, t.ops_json, t.last_updated,
      u.name AS assignee_name, p.name AS project_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assignee_id
    LEFT JOIN projects p ON p.id = t.project_id
    ${where}
    ORDER BY t.last_updated DESC
  `).all(...(params as string[])) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    asanaGid: String(row.asana_gid),
    title: String(row.title),
    status: String(row.status),
    phase: String(row.phase),
    priority: String(row.priority),
    requestType: String(row.request_type),
    dueDate: rowToDate(row.due_date),
    eta: rowToDate(row.eta),
    completed: rowToBool(row.completed),
    blocked: rowToBool(row.blocked),
    tags: String(row.tags),
    opsJson: String(row.ops_json),
    lastUpdated: rowToDate(row.last_updated) ?? new Date(),
    assigneeName: typeof row.assignee_name === "string" ? row.assignee_name : null,
    projectName: typeof row.project_name === "string" ? row.project_name : null,
  }));
}

function serializeTask(task: TaskRecord): TaskDto {
  const risk = calculateTaskRisk(task);
  const stale = staleSeverity(task.lastUpdated);
  const overdueDays = task.dueDate ? Math.max(0, Math.floor((Date.now() - task.dueDate.getTime()) / 86_400_000)) : 0;
  const staleDays = Math.floor((Date.now() - task.lastUpdated.getTime()) / 86_400_000);

  return {
    id: task.id,
    title: task.title,
    assignee: task.assigneeName ?? "Unassigned",
    status: task.status || task.phase,
    priority: task.priority,
    dueDate: task.dueDate?.toISOString() ?? null,
    project: task.projectName ?? "No Project",
    blocked: task.blocked,
    stale,
    risk,
    escalation: shouldEscalate({
      blockedDays: task.blocked ? staleDays : 0,
      overdueDays,
      priority: task.priority,
      staleDays,
    }),
  };
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(date: Date | null): string | null {
  return date?.toISOString() ?? null;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
