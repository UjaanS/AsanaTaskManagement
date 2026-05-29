import crypto from "node:crypto";

const algorithm = "aes-256-gcm";

function keyFromSecret(secret: string) {
  return crypto.createHash("sha256").update(secret).digest();
}

export function requireAppSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.APP_SECRET;
  if (!secret) throw new Error("Missing APP_SECRET. Set it in .env before saving an Asana PAT.");
  return secret;
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
