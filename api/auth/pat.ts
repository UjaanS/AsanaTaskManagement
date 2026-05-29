import crypto from "node:crypto";

const cookieName = "aocc_asana_session";
const maxAgeSeconds = 60 * 60 * 24 * 30;
const asanaMeUrl = "https://app.asana.com/api/1.0/users/me";

export default async function handler(request: any, response: any) {
  console.log("api/auth/pat route entered");
  console.log("api/auth/pat method received", request.method);
  console.log("api/auth/pat APP_SECRET present", Boolean(process.env.APP_SECRET));

  try {
    if (request.method === "GET") {
      return writeJson(response, 200, {
        ok: true,
        data: {
          connected: Boolean(readCookie(request.headers?.cookie, cookieName)),
          workspaceGid: null,
          updatedAt: null,
        },
      });
    }

    if (request.method === "DELETE") {
      response.setHeader("Set-Cookie", clearSessionCookie());
      return writeJson(response, 200, { ok: true });
    }

    if (request.method !== "POST") {
      response.setHeader("Allow", "GET,POST,DELETE");
      return writeJson(response, 405, { error: "method_not_allowed" });
    }

    const secret = process.env.APP_SECRET;
    if (!secret) {
      return writeJson(response, 500, { error: "missing_app_secret" });
    }

    const parsed = await parseJsonBody(request);
    console.log("api/auth/pat body parsed");
    if (!parsed.ok) {
      return writeJson(response, 400, { error: "invalid_json" });
    }

    const pat = typeof parsed.body.pat === "string" ? parsed.body.pat.trim() : "";
    const workspaceGid = typeof parsed.body.workspaceGid === "string" ? sanitizeOptional(parsed.body.workspaceGid) : undefined;
    console.log("api/auth/pat token present", Boolean(pat));
    if (!pat) {
      return writeJson(response, 400, { error: "missing_pat" });
    }

    console.log("api/auth/pat Asana validation started");
    const validation = await validateAsanaPat(pat);
    console.log("api/auth/pat Asana validation status code", validation.status);
    if (!validation.ok) {
      return writeJson(response, 401, { error: "invalid_asana_pat" });
    }

    console.log("api/auth/pat cookie encryption started");
    let cookie: string;
    try {
      cookie = createSessionCookie({ pat, workspaceGid, issuedAt: new Date().toISOString() }, secret);
    } catch (error) {
      console.error("api/auth/pat cookie encryption failed", safeErrorLog(error));
      return writeJson(response, 500, { error: "cookie_encryption_failed" });
    }

    response.setHeader("Set-Cookie", cookie);
    console.log("api/auth/pat cookie set");
    return writeJson(response, 200, {
      ok: true,
      data: { connected: true, workspaceGid: workspaceGid ?? null, updatedAt: new Date().toISOString() },
    });
  } catch (error) {
    console.error("api/auth/pat failed", safeErrorLog(error));
    return writeJson(response, 500, { error: "unexpected_auth_error" });
  }
}

async function parseJsonBody(request: any): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false }> {
  if (request.body && typeof request.body === "object") {
    return { ok: true, body: request.body as Record<string, unknown> };
  }

  if (typeof request.body === "string") {
    try {
      return { ok: true, body: JSON.parse(request.body) as Record<string, unknown> };
    } catch {
      return { ok: false };
    }
  }

  const chunks: Buffer[] = [];
  try {
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    return { ok: false };
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    return { ok: false };
  }
}

async function validateAsanaPat(pat: string): Promise<{ ok: boolean; status: number }> {
  const response = await fetch(asanaMeUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${pat}`,
    },
  });
  return { ok: response.ok, status: response.status };
}

function createSessionCookie(session: { pat: string; workspaceGid?: string; issuedAt: string }, secret: string): string {
  const sealed = encrypt(JSON.stringify(session), secret);
  return serializeCookie(cookieName, sealed, maxAgeSeconds);
}

function encrypt(value: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(secret).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function clearSessionCookie(): string {
  return serializeCookie(cookieName, "", 0);
}

function serializeCookie(name: string, value: string, maxAge: number): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) parts.push("Secure");
  return parts.join("; ");
}

function readCookie(cookieHeader: string | string[] | undefined, name: string): string | null {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  if (!header) return null;
  const prefix = `${name}=`;
  const cookie = header.split(";").map((value) => value.trim()).find((value) => value.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function sanitizeOptional(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("replace-with")) return undefined;
  return trimmed;
}

function writeJson(response: any, status: number, body: unknown) {
  response.status(status).json(body);
}

function safeErrorLog(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: "NonError", message: String(error), stack: undefined };
}
