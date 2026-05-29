import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

let database: DatabaseSync | null = null;

export interface TaskRecord {
  id: string;
  asanaGid: string;
  title: string;
  status: string;
  phase: string;
  priority: string;
  requestType: string;
  dueDate: Date | null;
  eta: Date | null;
  completed: boolean;
  blocked: boolean;
  tags: string;
  opsJson: string;
  lastUpdated: Date;
  assigneeName: string | null;
  projectName: string | null;
}

export function getDb() {
  if (database) return database;
  const filePath = databaseFilePath();
  mkdirSync(dirname(filePath), { recursive: true });
  database = new DatabaseSync(filePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(schemaSql);
  return database;
}

export function databaseFilePath() {
  const raw = process.env.DATABASE_URL ?? "file:./dev.db";
  const filePath = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  return resolve(process.cwd(), filePath);
}

export function rowToDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function rowToBool(value: unknown): boolean {
  return value === 1 || value === true;
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS integration_config (
  id TEXT PRIMARY KEY,
  pat_cipher_text TEXT,
  pat_valid INTEGER NOT NULL DEFAULT 0,
  workspace_gid TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  asana_gid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  team TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  asana_gid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_name TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  asana_gid TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  priority TEXT NOT NULL,
  request_type TEXT NOT NULL,
  due_date TEXT,
  eta TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL,
  ops_json TEXT NOT NULL,
  last_updated TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  assignee_id TEXT REFERENCES users(id),
  project_id TEXT REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS project_health_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  completion_pct REAL NOT NULL,
  overdue_count INTEGER NOT NULL,
  blocker_count INTEGER NOT NULL,
  risk_score REAL NOT NULL,
  health_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_completed ON tasks(due_date, completed);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_last_updated ON tasks(last_updated);
CREATE INDEX IF NOT EXISTS idx_tasks_blocked ON tasks(blocked);
CREATE INDEX IF NOT EXISTS idx_task_events_created ON task_events(created_at);
`;
