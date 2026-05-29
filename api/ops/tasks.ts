import type { IncomingMessage, ServerResponse } from "node:http";
import { handleOpsTasks } from "../../server/apiHandlers";
import { sendVercelResult } from "../../server/vercelRespond";

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  const result = await handleOpsTasks({
    method: request.method ?? "GET",
    cookieHeader: request.headers.cookie,
  });
  sendVercelResult(response, result);
}
