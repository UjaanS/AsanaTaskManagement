export default async function handler(request: any, response: any) {
  try {
    const { handleOpsTasks } = await import("../../server/apiHandlers");
    const { sendVercelResult } = await import("../../server/vercelRespond");
    const result = await handleOpsTasks({
      method: request.method ?? "GET",
      cookieHeader: request.headers.cookie,
    });
    sendVercelResult(response, result);
  } catch (error) {
    console.error("api/ops/tasks failed", safeErrorLog(error));
    writeJson(response, 500, { ok: false, error: "Unexpected server error while loading Asana tasks." });
  }
}

function safeErrorLog(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { message: String(error) };
}

function writeJson(response: any, status: number, body: unknown) {
  response.status(status).json(body);
}
