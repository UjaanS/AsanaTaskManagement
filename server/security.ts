import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

function keyFromSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest();
}

const MIN_SECRET_LENGTH = 32;

export function requireAppSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.APP_SECRET;
  if (!secret) throw new Error("Missing APP_SECRET. Set it in .env before saving an Asana PAT.");
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`APP_SECRET must be at least ${MIN_SECRET_LENGTH} characters to encrypt session cookies safely.`);
  }
  return secret;
}

// Call at server startup to fail fast on a misconfigured secret. Logs and exits
// rather than letting the first PAT save crash with a generic 500.
export function validateAppSecretOrExit(env: NodeJS.ProcessEnv = process.env): void {
  try {
    requireAppSecret(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Fatal: ${message}`);
    process.exit(1);
  }
}

export function encryptSecret(value: string, secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algorithm, keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(value: string, secret: string) {
  const [ivHex, tagHex, encryptedHex] = value.split(":");
  if (!ivHex || !tagHex || !encryptedHex) throw new Error("Stored Asana PAT is malformed.");
  const decipher = crypto.createDecipheriv(algorithm, keyFromSecret(secret), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}
