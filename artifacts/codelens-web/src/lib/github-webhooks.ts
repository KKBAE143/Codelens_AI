import crypto from "crypto";
import { db } from "@workspace/db";
import { webhookRegistrations, courses } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserGithubToken } from "./github-auth";

const MEANINGFUL_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cs",
  ".rb",
  ".kt",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".php",
  ".vue",
  ".svelte",
]);

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

export function hasMeaningfulChanges(files: string[]): boolean {
  return files.some((f) => {
    const ext = f.substring(f.lastIndexOf("."));
    return MEANINGFUL_EXTENSIONS.has(ext);
  });
}

export function extractChangedFiles(
  commits: Array<{ added?: string[]; modified?: string[]; removed?: string[] }>,
): { added: string[]; modified: string[]; removed: string[] } {
  const addedSet = new Set<string>();
  const modifiedSet = new Set<string>();
  const removedSet = new Set<string>();

  for (const commit of commits) {
    for (const f of commit.added || []) addedSet.add(f);
    for (const f of commit.modified || []) modifiedSet.add(f);
    for (const f of commit.removed || []) removedSet.add(f);
  }

  return {
    added: [...addedSet],
    modified: [...modifiedSet],
    removed: [...removedSet],
  };
}

export async function registerWebhook(
  owner: string,
  repo: string,
  courseId: string,
  userId: string,
): Promise<{ webhookId: string; registrationId: string }> {
  const token = await getUserGithubToken(userId);
  const secret = generateWebhookSecret();

  const base = process.env.WEBHOOK_BASE_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || "https://codelens.ai";
  const webhookUrl = `${base.replace(/\/$/, "")}/api/webhooks/github`;

  if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    throw new Error("LOCALHOST_URL");
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/hooks`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "CodeLens-AI",
      },
      body: JSON.stringify({
        name: "web",
        active: true,
        events: ["push"],
        config: {
          url: webhookUrl,
          content_type: "json",
          secret,
          insecure_ssl: "0",
        },
      }),
    },
  );

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    if (res.status === 404 || res.status === 403) {
      throw new Error(
        "You need admin access to this repository to enable auto-updates",
      );
    }
    const detail = (errorData as Record<string, string>).message || res.statusText;
    throw new Error(detail);
  }

  const hookData = await res.json();
  const webhookId = String(hookData.id);

  const [registration] = await db
    .insert(webhookRegistrations)
    .values({
      courseId,
      githubRepoFullName: `${owner}/${repo}`,
      webhookId,
      webhookSecret: secret,
      autoRegenerate: true,
    })
    .returning();

  return { webhookId, registrationId: registration.id };
}

export async function deleteWebhook(
  owner: string,
  repo: string,
  webhookId: string,
  userId: string,
): Promise<void> {
  try {
    const token = await getUserGithubToken(userId);
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/hooks/${webhookId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "CodeLens-AI",
        },
      },
    );
    if (!res.ok && res.status !== 404) {
      console.warn(`Failed to delete webhook ${webhookId}: ${res.status}`);
    }
  } catch (err) {
    console.warn("Failed to delete webhook from GitHub:", err);
  }
}

export async function cleanupWebhooksForCourse(
  courseId: string,
  userId: string,
): Promise<void> {
  const registrations = await db
    .select()
    .from(webhookRegistrations)
    .where(eq(webhookRegistrations.courseId, courseId));

  const [course] = await db
    .select({ ownerName: courses.ownerName, repoName: courses.repoName })
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  for (const reg of registrations) {
    if (course) {
      await deleteWebhook(
        course.ownerName,
        course.repoName,
        reg.webhookId,
        userId,
      );
    }
    await db
      .delete(webhookRegistrations)
      .where(eq(webhookRegistrations.id, reg.id));
  }
}

export async function getWebhookForCourse(courseId: string) {
  const [reg] = await db
    .select()
    .from(webhookRegistrations)
    .where(eq(webhookRegistrations.courseId, courseId))
    .limit(1);
  return reg || null;
}

export async function toggleAutoRegenerate(
  courseId: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(webhookRegistrations)
    .set({ autoRegenerate: enabled })
    .where(eq(webhookRegistrations.courseId, courseId));
}
