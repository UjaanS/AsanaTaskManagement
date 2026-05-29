import type { PhaseKey } from "../../src/types/ops";

export interface AsanaFieldMap {
  status?: string;
  priority?: string;
  requestType?: string;
  eta?: string;
  qaState?: string;
  statusFieldName?: string;
}

export interface AsanaServerConfig {
  accessToken: string;
  workspaceGid?: string;
  projectGids: string[];
  syncLookbackDays: number;
  fieldMap: Record<string, AsanaFieldMap>;
  projectNames: Record<string, string>;
  statusToPhase: Record<string, PhaseKey>;
}

export interface AsanaEnvSnapshot {
  accessTokenPresent: boolean;
  workspaceGid?: string;
  projectGids: string[];
  syncLookbackDays: number;
  fieldMap: Record<string, AsanaFieldMap>;
  projectNames: Record<string, string>;
  statusToPhase: Record<string, PhaseKey>;
  warnings: string[];
}

export class AsanaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AsanaConfigError";
  }
}

export const defaultStatusToPhase: Record<string, PhaseKey> = {
  "to do": "TODO",
  "not started": "TODO",
  "in progress": "DEV",
  development: "DEV",
  "working on it": "DEV",
  "ready for qa": "QA",
  qa: "QA",
  "in qa": "QA",
  "qa passed": "QA_PASSED",
  "qa pass": "QA_PASSED",
  "qa done": "QA_PASSED",
  "qa failed": "QA_FAILED",
  "qa fail": "QA_FAILED",
  er: "ER",
  "to release": "ER",
  "ready to release": "ER",
  done: "DONE",
  completed: "DONE",
  closed: "DONE",
  live: "LIVE",
  released: "LIVE",
  "on hold": "ON_HOLD",
  blocked: "ON_HOLD",
};

export function loadAsanaConfig(env: NodeJS.ProcessEnv = process.env): AsanaServerConfig {
  const snapshot = readAsanaEnv(env);
  const accessToken = env.ASANA_ACCESS_TOKEN;
  if (!accessToken) {
    throw new AsanaConfigError("Missing ASANA_ACCESS_TOKEN. Set it server-side in .env; do not expose it with VITE_ variables.");
  }

  if (snapshot.projectGids.length === 0) {
    throw new AsanaConfigError("Missing ASANA_PROJECT_GIDS. Provide one or more comma-separated Asana project GIDs.");
  }

  if (snapshot.warnings.length > 0) {
    throw new AsanaConfigError(snapshot.warnings[0]);
  }

  return {
    accessToken,
    workspaceGid: snapshot.workspaceGid,
    projectGids: snapshot.projectGids,
    syncLookbackDays: snapshot.syncLookbackDays,
    fieldMap: snapshot.fieldMap,
    projectNames: snapshot.projectNames,
    statusToPhase: snapshot.statusToPhase,
  };
}

export function readAsanaEnv(env: NodeJS.ProcessEnv = process.env): AsanaEnvSnapshot {
  const warnings: string[] = [];
  const fieldMap = parseJsonObject<Record<string, AsanaFieldMap>>(env.ASANA_FIELD_MAP_JSON, {}, "ASANA_FIELD_MAP_JSON", warnings);
  const projectNames = parseJsonObject<Record<string, string>>(env.ASANA_PROJECT_NAMES_JSON, {}, "ASANA_PROJECT_NAMES_JSON", warnings);
  const statusOverrides = parseJsonObject<Record<string, PhaseKey>>(env.ASANA_STATUS_TO_PHASE_JSON, {}, "ASANA_STATUS_TO_PHASE_JSON", warnings);

  return {
    accessTokenPresent: Boolean(normalizeConfiguredValue(env.ASANA_ACCESS_TOKEN)),
    workspaceGid: normalizeConfiguredValue(env.ASANA_WORKSPACE_GID),
    projectGids: parseCsv(env.ASANA_PROJECT_GIDS),
    syncLookbackDays: parsePositiveInt(env.ASANA_SYNC_LOOKBACK_DAYS, 30),
    fieldMap,
    projectNames,
    statusToPhase: {
      ...defaultStatusToPhase,
      ...normalizeStatusPhaseMap(statusOverrides),
    },
    warnings,
  };
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => Boolean(normalizeConfiguredValue(item)))
    .filter(Boolean);
}

export function normalizeConfiguredValue(value: string | null | undefined): string | undefined {
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

function parseJsonObject<T>(value: string | undefined, fallback: T, name: string, warnings: string[]): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as T;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    warnings.push(`${name} must be a JSON object.`);
    return fallback;
  } catch {
    warnings.push(`${name} is invalid JSON.`);
    return fallback;
  }
}

function normalizeStatusPhaseMap(map: Record<string, PhaseKey>): Record<string, PhaseKey> {
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key.toLowerCase(), value]));
}
