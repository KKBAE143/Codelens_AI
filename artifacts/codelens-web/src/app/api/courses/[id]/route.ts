export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courses, courseAssignments } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { cleanupWebhooksForCourse, getWebhookForCourse } from "@/lib/github-webhooks";

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
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.id, id),
        isNull(courses.deletedAt)
      )
    )
    .limit(1);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  let hasAccess = course.createdBy === user.id || course.isPublic;

  if (!hasAccess && course.organizationId) {
    const [assignment] = await db
      .select({ id: courseAssignments.id })
      .from(courseAssignments)
      .where(
        and(
          eq(courseAssignments.courseId, id),
          eq(courseAssignments.assignedTo, user.id)
        )
      )
      .limit(1);
    if (assignment) hasAccess = true;
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  let webhookInfo = null;
  if (course.createdBy === user.id) {
    const webhook = await getWebhookForCourse(id);
    if (webhook) {
      webhookInfo = {
        autoRegenerate: webhook.autoRegenerate,
        lastTriggeredAt: webhook.lastTriggeredAt,
      };
    }
  }

  return NextResponse.json({ course, webhook: webhookInfo });
}

export async function DELETE(
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
    .where(
      and(
        eq(courses.id, id),
        isNull(courses.deletedAt)
      )
    )
    .limit(1);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  if (course.createdBy !== user.id) {
    return NextResponse.json({ error: "Not authorized to delete this course" }, { status: 403 });
  }

  try {
    await cleanupWebhooksForCourse(id, user.id);
  } catch (err) {
    console.warn("Webhook cleanup failed during course deletion:", err);
  }

  await db
    .update(courses)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(courses.id, id));

  return NextResponse.json({ success: true });
}
