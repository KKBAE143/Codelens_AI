export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@workspace/db";
import { webhookRegistrations } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { verifyWebhookSignature, hasMeaningfulChanges, extractChangedFiles } from "@/lib/github-webhooks";
import { inngest, isInngestConfigured } from "@/lib/inngest";
import { regenerateCourseDirect } from "@/lib/jobs/regenerate-course-direct";

export async function POST(request: Request) {
  const event = request.headers.get("x-github-event");
  const signature = request.headers.get("x-hub-signature-256");

  if (event === "ping") {
    return NextResponse.json({ ok: true, message: "pong" });
  }

  if (event !== "push") {
    return NextResponse.json({ ok: true, message: "ignored" });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ ok: true, message: "no body" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, message: "invalid json" });
  }

  const repoFullName = (payload.repository as Record<string, unknown>)?.full_name as string;
  if (!repoFullName) {
    return NextResponse.json({ ok: true, message: "no repo" });
  }

  const registrations = await db
    .select()
    .from(webhookRegistrations)
    .where(eq(webhookRegistrations.githubRepoFullName, repoFullName));

  if (registrations.length === 0) {
    return NextResponse.json({ ok: true, message: "no registration" });
  }

  const commits = (payload.commits || []) as Array<{
    added?: string[];
    modified?: string[];
    removed?: string[];
    message?: string;
  }>;

  const { added, modified, removed } = extractChangedFiles(commits);
  const allChangedFiles = [...added, ...modified, ...removed];
  const commitMessages = commits.map((c) => c.message || "").filter(Boolean);

  if (!signature) {
    console.warn("Webhook received without signature, ignoring");
    return NextResponse.json({ ok: true, message: "ignored" });
  }

  for (const reg of registrations) {
    if (!verifyWebhookSignature(rawBody, signature, reg.webhookSecret)) {
      continue;
    }

    await db
      .update(webhookRegistrations)
      .set({ lastTriggeredAt: new Date() })
      .where(eq(webhookRegistrations.id, reg.id));

    if (!reg.autoRegenerate) continue;
    if (!hasMeaningfulChanges(allChangedFiles)) continue;

    try {
      if (isInngestConfigured()) {
        await inngest.send({
          name: "codelens/course.regenerate",
          data: {
            courseId: reg.courseId,
            changedFiles: { added, modified, removed },
            commitMessages,
          },
        });
      } else {
        regenerateCourseDirect(
          reg.courseId,
          { added, modified, removed },
          commitMessages
        ).catch((err) => {
          console.error("Direct regeneration failed:", err);
        });
      }
    } catch (err) {
      console.error("Failed to dispatch regeneration event:", err);
    }
  }

  return NextResponse.json({ ok: true, message: "processed" });
}
