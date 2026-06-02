import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { AsanaApiError } from "./asana/client";
import { AsanaConfigError, loadAsanaConfig } from "./asana/config";
import { buildAsanaDiagnostics } from "./asana/diagnostics";
import { fetchOpsTasks } from "./asana/service";
import { handleAuthPat, handleHealth, handleOpsTasks, handlePing, type ApiResult } from "./apiHandlers";
import { loadDotEnv } from "./env";
import { getSummary, listProjectHealth, listTaskDtos, listUserWorkloads, persistOpsTasks } from "./persistence/tasks";
import { validateAppSecretOrExit } from "./security";
import { runSync } from "./sync";

const defaultPort = Number(process.env.PORT ?? 8787);
const defaultHost = process.env.HOST ?? (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
loadDotEnv();
// Fail fast on a missing or weak APP_SECRET. Otherwise the first PAT save would
// crash with a generic 500 deep in the encryption path.
validateAppSecretOrExit();

export function startServer(port = defaultPort, host = defaultHost) {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "OPTIONS") {
        sendJson(response, 204, null);
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendApiResult(response, handleHealth());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/ping") {
        sendApiResult(response, handlePing());
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/ops/tasks") {
        sendApiResult(response, await handleOpsTasks({ method: request.method, cookieHeader: request.headers.cookie, query: url.searchParams }));
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
        sendApiResult(response, await handleAuthPat({ method: request.method, cookieHeader: request.headers.cookie }));
        return;
      }

      if ((request.method === "POST" || request.method === "DELETE") && url.pathname === "/api/auth/pat") {
        const body = request.method === "POST" ? await readJsonBody<{ pat?: string; workspaceGid?: string }>(request) : undefined;
        sendApiResult(response, await handleAuthPat({ method: request.method, cookieHeader: request.headers.cookie, body }));
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

// Single source of truth for the allowed origin. Defaults to the Vite dev
// origin so the dashboard works out of the box; production deployments MUST
// set CORS_ORIGIN explicitly to the deployed dashboard origin.
function corsOrigin(): string {
  return process.env.CORS_ORIGIN ?? "http://127.0.0.1:5173";
}

function sendJson(response: http.ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": corsOrigin(),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  });
  response.end(payload === null ? "" : JSON.stringify(payload));
}

function sendApiResult(response: http.ServerResponse, result: ApiResult) {
  response.writeHead(result.status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": corsOrigin(),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    ...(result.headers ?? {}),
  });
  response.end(JSON.stringify(result.body));
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
