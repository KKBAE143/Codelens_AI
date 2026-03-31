import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import CryptoJS from "crypto-js";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.warn("ENCRYPTION_KEY is not set. GitHub token encryption/decryption will fail.");
}

export function encryptToken(token: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY environment variable is required for token encryption.");
  }
  return CryptoJS.AES.encrypt(token, ENCRYPTION_KEY).toString();
}

export function decryptToken(encrypted: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY environment variable is required for token decryption.");
  }
  const bytes = CryptoJS.AES.decrypt(encrypted, ENCRYPTION_KEY);
  const result = bytes.toString(CryptoJS.enc.Utf8);
  if (!result) {
    throw new Error("Failed to decrypt token. ENCRYPTION_KEY may have changed.");
  }
  return result;
}

export async function getUserGithubToken(userId: string): Promise<string> {
  const [user] = await db
    .select({ githubAccessToken: users.githubAccessToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.githubAccessToken) {
    throw new Error(
      "GitHub access token not found. Please sign in again to reconnect your GitHub account.",
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
