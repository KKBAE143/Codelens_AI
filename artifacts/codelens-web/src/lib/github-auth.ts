/**
 * MIGRATION NOTE:
 * This file was migrated from CryptoJS to Node.js native crypto (AES-256-GCM).
 * Tokens previously encrypted with CryptoJS will fail to decrypt after this change.
 * Users may need to re-authenticate with GitHub to regenerate their tokens.
 */
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required.");
  }
  return key;
}

function deriveKey(): Buffer {
  const rawKey = getEncryptionKey();
  const isHex = /^[0-9a-fA-F]+$/.test(rawKey);
  const input = isHex
    ? Buffer.from(rawKey, "hex")
    : Buffer.from(rawKey, "utf8");
  const key = Buffer.alloc(32, 0);
  input.copy(key);
  return key;
}

export function encryptToken(token: string): string {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(token, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptToken(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Failed to decrypt token. ENCRYPTION_KEY may have changed.");
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  const key = deriveKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertextHex, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

export async function getUserGithubToken(userId: string): Promise<string> {
  const [user] = await db
    .select({ githubAccessToken: users.githubAccessToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.githubAccessToken) {
    throw new Error(
      "GitHub access token not found. Please sign out and sign in again to refresh your token.",
    );
  }

  return decryptToken(user.githubAccessToken);
}

export async function storeGithubToken(
  userId: string,
  accessToken: string,
  githubUsername: string,
): Promise<void> {
  const encrypted = encryptToken(accessToken);
  await db
    .update(users)
    .set({
      githubAccessToken: encrypted,
      githubUsername,
      githubConnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
