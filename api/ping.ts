import type { IncomingMessage, ServerResponse } from "node:http";
import { handlePing } from "../server/apiHandlers";
import { sendVercelResult } from "../server/vercelRespond";

export default function handler(_request: IncomingMessage, response: ServerResponse) {
  sendVercelResult(response, handlePing());
}
