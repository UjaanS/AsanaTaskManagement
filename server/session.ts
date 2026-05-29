import { decryptSecret, encryptSecret, requireAppSecret } from "./security";

const cookieName = "aocc_asana_session";
const maxAgeSeconds = 60 * 60 * 24 * 30;

export interface AsanaSession {
  pat: string;
  workspaceGid?: string;
  issuedAt: string;
}

export function readAsanaSession(cookieHeader: string | string[] | undefined, env: NodeJS.ProcessEnv = process.env): AsanaSession | null {
  const sealed = readCookie(cookieHeader, cookieName);
  if (!sealed) return null;

  try {
    const json = decryptSecret(sealed, requireAppSecret(env));
    const parsed = JSON.parse(json) as Partial<AsanaSession>;
    if (!parsed.pat || !parsed.issuedAt) return null;
    return {
      pat: parsed.pat,
      workspaceGid: parsed.workspaceGid,
      issuedAt: parsed.issuedAt,
    };
  } catch {
    return null;
  }
}

export function createAsanaSessionCookie(session: AsanaSession, env: NodeJS.ProcessEnv = process.env): string {
  const sealed = encryptSecret(JSON.stringify(session), requireAppSecret(env));
  return serializeCookie(cookieName, sealed, { maxAge: maxAgeSeconds });
}

export function clearAsanaSessionCookie(): string {
  return serializeCookie(cookieName, "", { maxAge: 0 });
}

function readCookie(cookieHeader: string | string[] | undefined, name: string): string | null {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  if (!header) return null;
  const cookies = header.split(";").map((item) => item.trim());
  const prefix = `${name}=`;
  const match = cookies.find((item) => item.startsWith(prefix));
  if (!match) return null;
  return decodeURIComponent(match.slice(prefix.length));
}

function serializeCookie(name: string, value: string, options: { maxAge: number }): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAge}`,
  ];
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) parts.push("Secure");
  return parts.join("; ");
}
