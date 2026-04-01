export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import {
  registerWebhook,
  getWebhookForCourse,
  cleanupWebhooksForCourse,
} from "@/lib/github-webhooks";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const [course] = await db
    .select({ id: courses.id, createdBy: courses.createdBy })
    .from(courses)
    .where(and(eq(courses.id, id), isNull(courses.deletedAt)))
    .limit(1);

  if (!course || course.createdBy !== user.id) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const webhook = await getWebhookForCourse(id);

  return NextResponse.json({
    webhook: webhook
      ? {
          id: webhook.id,
          autoRegenerate: webhook.autoRegenerate,
          lastTriggeredAt: webhook.lastTriggeredAt,
          createdAt: webhook.createdAt,
        }
      : null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), eq(courses.createdBy, user.id), isNull(courses.deletedAt)))
    .limit(1);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { enabled } = body;
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
  }

  const existingWebhook = await getWebhookForCourse(id);

  if (enabled && !existingWebhook) {
    try {
      const result = await registerWebhook(
        course.ownerName,
        course.repoName,
        course.id,
        user.id
      );
      return NextResponse.json({ success: true, webhookId: result.webhookId });
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to register webhook";
      console.error("Webhook registration error:", raw);
      const message =
        raw === "LOCALHOST_URL"
          ? "Auto-updates are not available in development (localhost URL detected)"
          : raw.startsWith("You need admin access")
            ? raw
            : `Failed to register webhook: ${raw}`;
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (!enabled && existingWebhook) {
    await cleanupWebhooksForCourse(id, user.id);
    return NextResponse.json({ success: true, message: "Webhook removed" });
  }

  return NextResponse.json({ success: true, message: "No change needed" });
}
