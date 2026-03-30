export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courseProgress, courses, courseAssignments, organizations } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { sendSlackNotification, courseCompletedMessage } from "@/lib/slack";

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

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.courseId, courseId),
        eq(courseProgress.userId, user.id)
      )
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ completedModules: [], percentComplete: 0, lastSeenVersion: 0 });
  }

  return NextResponse.json({
    completedModules: existing.completedModules || [],
    percentComplete: existing.percentComplete,
    completedAt: existing.completedAt,
    lastSeenVersion: existing.lastSeenVersion || 1,
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

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { moduleIndex, totalModules, markVersionSeen } = body;

  if (typeof markVersionSeen === "number") {
    const [courseRecord] = await db
      .select({
        id: courses.id,
        createdBy: courses.createdBy,
        isPublic: courses.isPublic,
        organizationId: courses.organizationId,
      })
      .from(courses)
      .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
      .limit(1);

    if (!courseRecord) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 });
    }

    let hasAccess = courseRecord.createdBy === user.id || courseRecord.isPublic;
    if (!hasAccess && courseRecord.organizationId) {
      const [assignment] = await db
        .select({ id: courseAssignments.id })
        .from(courseAssignments)
        .where(
          and(
            eq(courseAssignments.courseId, courseId),
            eq(courseAssignments.assignedTo, user.id)
          )
        )
        .limit(1);
      if (assignment) hasAccess = true;
    }
    if (!hasAccess) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const [existing] = await db
      .select()
      .from(courseProgress)
      .where(
        and(
          eq(courseProgress.courseId, courseId),
          eq(courseProgress.userId, user.id)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(courseProgress)
        .set({
          lastSeenVersion: markVersionSeen,
          lastViewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(courseProgress.id, existing.id));
    } else {
      await db.insert(courseProgress).values({
        courseId,
        userId: user.id,
        completedModules: [],
        percentComplete: 0,
        lastSeenVersion: markVersionSeen,
        lastViewedAt: new Date(),
      });
    }

    return NextResponse.json({ success: true, lastSeenVersion: markVersionSeen });
  }

  if (typeof moduleIndex !== "number") {
    return NextResponse.json({ error: "moduleIndex is required" }, { status: 400 });
  }

  const [courseRecord] = await db
    .select({
      id: courses.id,
      createdBy: courses.createdBy,
      isPublic: courses.isPublic,
      repoName: courses.repoName,
      ownerName: courses.ownerName,
      organizationId: courses.organizationId,
    })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
    .limit(1);

  if (!courseRecord) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  let hasAccess = courseRecord.createdBy === user.id || courseRecord.isPublic;

  if (!hasAccess && courseRecord.organizationId) {
    const [assignment] = await db
      .select({ id: courseAssignments.id })
      .from(courseAssignments)
      .where(
        and(
          eq(courseAssignments.courseId, courseId),
          eq(courseAssignments.assignedTo, user.id)
        )
      )
      .limit(1);
    if (assignment) hasAccess = true;
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const [existing] = await db
    .select()
    .from(courseProgress)
    .where(
      and(
        eq(courseProgress.courseId, courseId),
        eq(courseProgress.userId, user.id)
      )
    )
    .limit(1);

  if (existing) {
    const completedModules = (existing.completedModules || []) as number[];
    if (!completedModules.includes(moduleIndex)) {
      completedModules.push(moduleIndex);
    }
    const percentComplete = totalModules
      ? Math.round((completedModules.length / totalModules) * 100)
      : existing.percentComplete;

    await db
      .update(courseProgress)
      .set({
        completedModules,
        percentComplete,
        lastViewedAt: new Date(),
        completedAt: percentComplete >= 100 ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(courseProgress.id, existing.id));

    if (percentComplete >= 100 && !existing.completedAt) {
      triggerSlackCompletion(courseRecord, user).catch(() => {});
    }

    return NextResponse.json({ success: true, percentComplete, completedModules });
  }

  const completedModules = [moduleIndex];
  const percentComplete = totalModules ? Math.round((1 / totalModules) * 100) : 0;
  const isCompleted = percentComplete >= 100;

  await db.insert(courseProgress).values({
    courseId,
    userId: user.id,
    completedModules,
    percentComplete,
    lastViewedAt: new Date(),
    completedAt: isCompleted ? new Date() : null,
  });

  if (isCompleted) {
    triggerSlackCompletion(courseRecord, user).catch(() => {});
  }

  return NextResponse.json({ success: true, percentComplete, completedModules });
}

async function triggerSlackCompletion(
  courseRecord: { id: string; organizationId: string | null; repoName: string; ownerName: string },
  user: { id: string; displayName: string }
) {
  if (!courseRecord.organizationId) return;

  const [assignment] = await db
    .select()
    .from(courseAssignments)
    .where(
      and(
        eq(courseAssignments.courseId, courseRecord.id),
        eq(courseAssignments.assignedTo, user.id)
      )
    )
    .limit(1);

  if (!assignment) return;

  const [org] = await db
    .select({ slackWebhookUrl: organizations.slackWebhookUrl })
    .from(organizations)
    .where(eq(organizations.id, courseRecord.organizationId))
    .limit(1);

  if (org?.slackWebhookUrl) {
    await sendSlackNotification(
      org.slackWebhookUrl,
      courseCompletedMessage(
        `${courseRecord.ownerName}/${courseRecord.repoName}`,
        user.displayName
      )
    );
  }
}
