import { validateAccessToken } from "./asana/client";
import { AsanaApiError } from "./asana/client";
import { AsanaConfigError, normalizeConfiguredValue } from "./asana/config";
import { buildSessionAsanaConfig } from "./asana/sessionConfig";
import { fetchOpsTasks } from "./asana/service";
import { clearAsanaSessionCookie, createAsanaSessionCookie, readAsanaSession } from "./session";

export interface ApiResult {
  status: number;
  body: unknown;
  headers?: Record<string, string | string[]>;
}

export function handleHealth(): ApiResult {
  return { status: 200, body: { ok: true } };
}

export async function handleAuthPat(input: {
  method: string;
  cookieHeader?: string | string[];
  body?: unknown;
}): Promise<ApiResult> {
  if (input.method === "GET") {
    const session = readAsanaSession(input.cookieHeader);
    return {
      status: 200,
      body: {
        ok: true,
        data: {
          connected: Boolean(session),
          workspaceGid: session?.workspaceGid ?? null,
          updatedAt: session?.issuedAt ?? null,
        },
      },
    };
  }

  if (input.method === "DELETE" || input.method === "POST" && isLogoutBody(input.body)) {
    return {
      status: 200,
      body: { ok: true },
      headers: { "Set-Cookie": clearAsanaSessionCookie() },
    };
  }

  if (input.method !== "POST") {
    return methodNotAllowed("GET,POST,DELETE");
  }

  const body = coerceObject(input.body) as { pat?: unknown; workspaceGid?: unknown };
  const pat = typeof body.pat === "string" ? body.pat.trim() : "";
  if (pat.length < 10) {
    return { status: 400, body: { ok: false, error: "Asana PAT is required." } };
  }

  try {
    await validateAccessToken(pat);
    const workspaceGid = typeof body.workspaceGid === "string" ? normalizeConfiguredValue(body.workspaceGid) : undefined;
    const issuedAt = new Date().toISOString();
    return {
      status: 200,
      body: { ok: true, data: { connected: true, workspaceGid: workspaceGid ?? null, updatedAt: issuedAt } },
      headers: {
        "Set-Cookie": createAsanaSessionCookie({ pat, workspaceGid, issuedAt }),
      },
    };
  } catch (error) {
    return toApiError(error);
  }
}

export async function handleOpsTasks(input: { method: string; cookieHeader?: string | string[] }): Promise<ApiResult> {
  if (input.method !== "GET") {
    return methodNotAllowed("GET");
  }

  const session = readAsanaSession(input.cookieHeader);
  if (!session) {
    return {
      status: 401,
      body: { error: "No Asana session found. Open Settings and save your Asana PAT before loading tasks." },
    };
  }

  try {
    const config = await buildSessionAsanaConfig(session.pat, session.workspaceGid);
    const tasks = await fetchOpsTasks(config);
    return { status: 200, body: { tasks } };
  } catch (error) {
    return toApiError(error);
  }
}

export function toApiError(error: unknown): ApiResult {
  if (error instanceof AsanaConfigError) {
    return { status: 400, body: { ok: false, error: error.message } };
  }

  if (error instanceof AsanaApiError) {
    const status = error.status === 401 || error.status === 403 ? 401 : error.status === 404 ? 404 : error.status === 429 ? 429 : 502;
    return { status, body: { ok: false, error: error.safeMessage } };
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  const safeMessage = message.includes("APP_SECRET") ? message : "Unexpected server error while loading Asana data.";
  return { status: 500, body: { ok: false, error: safeMessage } };
}

function methodNotAllowed(allow: string): ApiResult {
  return { status: 405, body: { ok: false, error: "Method not allowed." }, headers: { Allow: allow } };
}

function coerceObject(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return typeof body === "object" ? body as Record<string, unknown> : {};
}

function isLogoutBody(body: unknown): boolean {
  const object = coerceObject(body);
  return object.action === "logout" || object.action === "clear";
}
