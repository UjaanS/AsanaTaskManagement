import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAuthPat } from "../../server/apiHandlers";
import { readVercelBody, sendVercelResult } from "../../server/vercelRespond";

export default async function handler(request: IncomingMessage & { body?: unknown }, response: ServerResponse) {
  const body = request.body ?? await readVercelBody(request);
  const result = await handleAuthPat({
    method: request.method ?? "GET",
    cookieHeader: request.headers.cookie,
    body,
  });
  sendVercelResult(response, result);
}
