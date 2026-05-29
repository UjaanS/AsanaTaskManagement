export default async function handler(request: any, response: any) {
  try {
    const { handleAuthPat } = await import("../../server/apiHandlers");
    const { readVercelBody, sendVercelResult } = await import("../../server/vercelRespond");
    const body = request.body ?? await readVercelBody(request);
    const result = await handleAuthPat({
      method: request.method ?? "GET",
      cookieHeader: request.headers.cookie,
      body,
    });
    sendVercelResult(response, result);
  } catch (error) {
    console.error("api/auth/pat failed", safeErrorLog(error));
    writeJson(response, 500, { ok: false, error: "Unexpected server error while handling Asana session." });
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
