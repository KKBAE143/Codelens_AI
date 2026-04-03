export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { flashcards, flashcardReviews, courses, courseAssignments } from "@workspace/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ counts: {} }); }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ counts: {} });
  }

  const [courseRecord] = await db
    .select({ id: courses.id, createdBy: courses.createdBy, isPublic: courses.isPublic, organizationId: courses.organizationId })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
    .limit(1);

  if (!courseRecord) return NextResponse.json({ counts: {} });

  let hasAccess = courseRecord.createdBy === user.id || courseRecord.isPublic;
  if (!hasAccess && courseRecord.organizationId) {
    const [assignment] = await db
      .select({ id: courseAssignments.id })
      .from(courseAssignments)
      .where(and(eq(courseAssignments.courseId, courseId), eq(courseAssignments.assignedTo, user.id)))
      .limit(1);
    if (assignment) hasAccess = true;
  }
  if (!hasAccess) return NextResponse.json({ counts: {} });

  const now = new Date();

  const rows = await db
    .select({
      moduleIndex: flashcards.moduleIndex,
      dueCount: sql<number>`count(*)::int`,
    })
    .from(flashcards)
    .leftJoin(
      flashcardReviews,
      and(eq(flashcardReviews.flashcardId, flashcards.id), eq(flashcardReviews.userId, user.id))
    )
    .where(
      and(
        eq(flashcards.courseId, courseId),
        sql`(${flashcardReviews.id} IS NULL OR ${flashcardReviews.due} <= ${now})`
      )
    )
    .groupBy(flashcards.moduleIndex);

  const counts: Record<number, number> = {};
  for (const row of rows) {
    counts[row.moduleIndex] = row.dueCount;
  }

  return NextResponse.json({ counts });
}
