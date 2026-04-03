export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courseComments, courses, courseAssignments } from "@workspace/db/schema";
import { eq, and, isNull, desc } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function checkCourseAccess(courseId: string, userId: string) {
  const [courseRecord] = await db
    .select({ id: courses.id, createdBy: courses.createdBy, isPublic: courses.isPublic, organizationId: courses.organizationId })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
    .limit(1);

  if (!courseRecord) return null;

  let hasAccess = courseRecord.createdBy === userId || courseRecord.isPublic;
  if (!hasAccess && courseRecord.organizationId) {
    const [assignment] = await db
      .select({ id: courseAssignments.id })
      .from(courseAssignments)
      .where(and(eq(courseAssignments.courseId, courseId), eq(courseAssignments.assignedTo, userId)))
      .limit(1);
    if (assignment) hasAccess = true;
  }
  return hasAccess ? courseRecord : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const course = await checkCourseAccess(courseId, user.id);
  if (!course) return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });

  const url = new URL(request.url);
  const moduleIndexParam = url.searchParams.get("moduleIndex");
  const moduleFilter = moduleIndexParam !== null ? parseInt(moduleIndexParam, 10) : null;

  const whereConditions = moduleFilter !== null && !isNaN(moduleFilter)
    ? and(eq(courseComments.courseId, courseId), eq(courseComments.moduleIndex, moduleFilter))
    : eq(courseComments.courseId, courseId);

  const comments = await db
    .select()
    .from(courseComments)
    .where(whereConditions)
    .orderBy(desc(courseComments.createdAt));

  const threaded = comments.filter((c) => !c.parentId);
  const replies = comments.filter((c) => c.parentId);
  const threadedComments = threaded.map((t) => ({
    ...t,
    replies: replies.filter((r) => r.parentId === t.id).reverse(),
  }));

  return NextResponse.json({ comments: threadedComments });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const course = await checkCourseAccess(courseId, user.id);
  if (!course) return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });

  let body: { moduleIndex: number; content: string; parentId?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { moduleIndex, content, parentId } = body;
  if (typeof moduleIndex !== "number" || typeof content !== "string" || !content.trim()) {
    return NextResponse.json({ error: "moduleIndex and content are required" }, { status: 400 });
  }

  if (content.trim().length > 2000) {
    return NextResponse.json({ error: "Comment must be 2000 characters or less" }, { status: 400 });
  }

  if (parentId && !UUID_RE.test(parentId)) {
    return NextResponse.json({ error: "Invalid parent ID" }, { status: 400 });
  }

  const [inserted] = await db
    .insert(courseComments)
    .values({
      courseId,
      moduleIndex,
      userId: user.id,
      userName: user.displayName || user.email?.split("@")[0] || "Anonymous",
      userAvatar: user.avatarUrl || null,
      content: content.trim(),
      parentId: parentId || null,
    })
    .returning();

  return NextResponse.json({ comment: inserted });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }

  const { id: courseId } = await params;

  const url = new URL(request.url);
  const commentId = url.searchParams.get("commentId");
  if (!commentId || !UUID_RE.test(commentId)) {
    return NextResponse.json({ error: "Valid commentId required" }, { status: 400 });
  }

  const [comment] = await db
    .select({ userId: courseComments.userId })
    .from(courseComments)
    .where(and(eq(courseComments.id, commentId), eq(courseComments.courseId, courseId)))
    .limit(1);

  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  if (comment.userId !== user.id) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  await db.delete(courseComments).where(eq(courseComments.id, commentId));
  return NextResponse.json({ success: true });
}
