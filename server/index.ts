import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import crypto from "node:crypto";
import { AsanaApiError, validateAccessToken } from "./asana/client";
import { AsanaConfigError, loadAsanaConfig, normalizeConfiguredValue } from "./asana/config";
import { buildAsanaDiagnostics } from "./asana/diagnostics";
import { fetchOpsTasks } from "./asana/service";
import { getDb } from "./db";
import { loadDotEnv } from "./env";
import { getLastSyncAt, getSummary, listPersistedOpsTasks, listProjectHealth, listTaskDtos, listUserWorkloads, persistOpsTasks } from "./persistence/tasks";
import { encryptSecret, requireAppSecret } from "./security";
import { runSync } from "./sync";

const defaultPort = Number(process.env.PORT ?? 8787);
const defaultHost = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
loadDotEnv();

export function startServer(port = defaultPort, host = defaultHost) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "OPTIONS") {
        sendJson(response, 204, null);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, lastSyncAt: await getLastSyncAt() });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/ops/tasks") {
        const tasks = await listPersistedOpsTasks();
        sendJson(response, 200, { tasks });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/ops/tasks/refresh") {
        const config = loadAsanaConfig();
        const tasks = await fetchOpsTasks(config);
        await persistOpsTasks(tasks);
        sendJson(response, 200, { ok: true, tasks });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/tasks") {
        sendJson(response, 200, { ok: true, data: await listTaskDtos(url.searchParams) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/projects") {
        sendJson(response, 200, { ok: true, data: await listProjectHealth() });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/users") {
        sendJson(response, 200, { ok: true, data: await listUserWorkloads() });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/summary") {
        sendJson(response, 200, { ok: true, data: await getSummary() });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/auth/pat") {
        const config = getDb()
          .prepare("SELECT pat_valid, workspace_gid, updated_at FROM integration_config ORDER BY updated_at DESC LIMIT 1")
          .get() as { pat_valid?: number; workspace_gid?: string | null; updated_at?: string | null } | undefined;
        sendJson(response, 200, {
          ok: true,
          data: {
            connected: Boolean(config?.pat_valid) || Boolean(normalizeConfiguredValue(process.env.ASANA_ACCESS_TOKEN)),
            workspaceGid: normalizeConfiguredValue(config?.workspace_gid) ?? normalizeConfiguredValue(process.env.ASANA_WORKSPACE_GID) ?? null,
            updatedAt: config?.updated_at ?? null,
          },
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/auth/pat") {
        const body = await readJsonBody<{ pat?: string; workspaceGid?: string }>(request);
        const pat = body.pat?.trim() ?? "";
        if (pat.length < 10) {
          sendJson(response, 400, { ok: false, error: "Asana PAT is required." });
          return;
        }

        await validateAccessToken(pat);
        const existing = getDb()
          .prepare("SELECT id, workspace_gid FROM integration_config ORDER BY updated_at DESC LIMIT 1")
          .get() as { id: string; workspace_gid?: string | null } | undefined;
        const patCipherText = encryptSecret(pat, requireAppSecret());
        const workspaceGid = normalizeConfiguredValue(body.workspaceGid) ?? normalizeConfiguredValue(existing?.workspace_gid) ?? normalizeConfiguredValue(process.env.ASANA_WORKSPACE_GID) ?? null;
        const now = new Date().toISOString();
        const id = existing?.id ?? crypto.randomUUID();
        if (existing) {
          getDb()
            .prepare("UPDATE integration_config SET pat_cipher_text = ?, pat_valid = 1, workspace_gid = ?, updated_at = ? WHERE id = ?")
            .run(patCipherText, workspaceGid, now, id);
        } else {
          getDb()
            .prepare("INSERT INTO integration_config (id, pat_cipher_text, pat_valid, workspace_gid, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?)")
            .run(id, patCipherText, workspaceGid, now, now);
        }
        sendJson(response, 200, { ok: true, data: { id, patValid: true } });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/sync") {
        const result = await runSync();
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/asana/diagnostics") {
        const diagnostics = await buildAsanaDiagnostics();
        sendJson(response, 200, diagnostics);
        return;
      }

      if (process.env.SERVE_STATIC === "true") {
        const served = await tryServeStatic(url.pathname, response);
        if (served) return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      const safeError = toSafeError(error);
      console.error(safeError.logMessage);
      sendJson(response, safeError.status, { error: safeError.message });
    }
  });

  server.listen(port, host, () => {
    console.log(`AOCC API listening on http://${host}:${port}`);
  });

  return server;
}

function toSafeError(error: unknown): { status: number; message: string; logMessage: string } {
  if (error instanceof AsanaConfigError) {
    return {
      status: 400,
      message: error.message,
      logMessage: error.message,
    };
  }

  if (error instanceof AsanaApiError) {
    return {
      status: error.status === 401 || error.status === 403 ? 401 : error.status === 404 ? 404 : error.status === 429 ? 429 : 502,
      message: error.safeMessage,
      logMessage: error.message,
    };
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return {
    status: 500,
    message: "Unexpected server error while loading Asana data.",
    logMessage: message,
  };
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end(payload === null ? "" : JSON.stringify(payload));
}

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) as T : {} as T;
}

async function tryServeStatic(pathname: string, response: http.ServerResponse): Promise<boolean> {
  const safePath = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(process.cwd(), "dist", safePath);
  try {
    const bytes = await readFile(filePath);
    response.writeHead(200, { "Content-Type": contentType(filePath) });
    response.end(bytes);
    return true;
  } catch {
    if (pathname !== "/") {
      try {
        const bytes = await readFile(join(process.cwd(), "dist", "index.html"));
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(bytes);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

function contentType(filePath: string): string {
  if (extname(filePath) === ".html") return "text/html";
  if (extname(filePath) === ".css") return "text/css";
  if (extname(filePath) === ".js") return "text/javascript";
  return "application/octet-stream";
}
