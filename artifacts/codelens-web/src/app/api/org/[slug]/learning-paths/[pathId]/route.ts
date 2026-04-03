export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import {
  learningPaths,
  learningPathCourses,
  learningPathAssignments,
  courseProgress,
  users,
} from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; pathId: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { slug, pathId } = await params;
  const result = await requireOrgMembership(slug, user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const [path] = await db
    .select()
    .from(learningPaths)
    .where(and(eq(learningPaths.id, pathId), eq(learningPaths.organizationId, result.org.id)));

  if (!path) {
    return NextResponse.json({ error: "Learning path not found" }, { status: 404 });
  }

  const pathCourses = await db
    .select()
    .from(learningPathCourses)
    .where(eq(learningPathCourses.learningPathId, pathId));

  const assignments = await db
    .select()
    .from(learningPathAssignments)
    .where(eq(learningPathAssignments.learningPathId, pathId));

  const courseIds = pathCourses.map((pc) => pc.courseId);
  const assignedUserIds = assignments.map((a) => a.userId);

  let progressRecords: Array<typeof courseProgress.$inferSelect> = [];
  if (courseIds.length > 0 && assignedUserIds.length > 0) {
    progressRecords = await db
      .select()
      .from(courseProgress)
      .where(
        and(
          inArray(courseProgress.courseId, courseIds),
          inArray(courseProgress.userId, assignedUserIds)
        )
      );
  }

  const assignmentsEnriched = assignments.map((a) => {
    const courseProgresses = courseIds.map((cid) => {
      const prog = progressRecords.find((p) => p.courseId === cid && p.userId === a.userId);
      return prog?.percentComplete || 0;
    });
    const avgPercent = courseProgresses.length > 0
      ? Math.round(courseProgresses.reduce((s, v) => s + v, 0) / courseProgresses.length)
      : 0;
    return { ...a, percentComplete: avgPercent };
  });

  return NextResponse.json({
    learningPath: path,
    courses: pathCourses.sort((a, b) => a.position - b.position),
    assignments: assignmentsEnriched,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; pathId: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { slug, pathId } = await params;
  const result = await requireOrgMembership(slug, user.id, "admin");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await db.delete(learningPaths).where(
    and(eq(learningPaths.id, pathId), eq(learningPaths.organizationId, result.org.id))
  );

  return NextResponse.json({ success: true });
}
