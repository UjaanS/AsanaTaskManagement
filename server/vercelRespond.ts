import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiResult } from "./apiHandlers";

export function sendVercelResult(response: ServerResponse, result: ApiResult) {
  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json");
  for (const [key, value] of Object.entries(result.headers ?? {})) {
    response.setHeader(key, value);
  }
  response.end(JSON.stringify(result.body));
}

export async function readVercelBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return {};
  }
}
