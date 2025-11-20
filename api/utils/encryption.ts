import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";

const ALGORITHM = "aes-256-gcm";

const getEncryptionKey = (): Buffer => {
  const keyHex = Deno.env.get("ENCRYPTION_KEY");
  if (!keyHex) {
    throw new Error("ENCRYPTION_KEY environment variable not set");
  }
  if (keyHex.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be 64 hex characters (32 bytes). Generate with: openssl rand -hex 32"
    );
  }
  return Buffer.from(keyHex, "hex");
};

export const encrypt = (plaintext: string): string => {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
};

export const decrypt = (ciphertext: string): string => {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format. Expected format: iv:authTag:ciphertext");
  }

  const [ivHex, authTagHex, encrypted] = parts;

  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error("Invalid ciphertext: missing components");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

export const validateEncryptionKey = (): void => {
  try {
    getEncryptionKey();
  } catch (error) {
    console.error("Encryption key validation failed:", error);
    throw error;
  }
};
