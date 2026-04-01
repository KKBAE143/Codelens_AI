export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { moduleQuizScores, courses, courseAssignments } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { awardXp } from "@/lib/xp";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function checkCourseAccess(courseId: string, userId: string) {
  const [course] = await db
    .select({ id: courses.id, createdBy: courses.createdBy, isPublic: courses.isPublic, organizationId: courses.organizationId })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
    .limit(1);
  if (!course) return null;
  let hasAccess = course.createdBy === userId || course.isPublic;
  if (!hasAccess && course.organizationId) {
    const [assignment] = await db
      .select({ id: courseAssignments.id })
      .from(courseAssignments)
      .where(and(eq(courseAssignments.courseId, courseId), eq(courseAssignments.assignedTo, userId)))
      .limit(1);
    if (assignment) hasAccess = true;
  }
  return hasAccess ? course : null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });

  const course = await checkCourseAccess(courseId, user.id);
  if (!course) return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });

  const scores = await db
    .select()
    .from(moduleQuizScores)
    .where(and(eq(moduleQuizScores.courseId, courseId), eq(moduleQuizScores.userId, user.id)));

  return NextResponse.json({ scores });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });

  const course = await checkCourseAccess(courseId, user.id);
  if (!course) return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });

  let body: { moduleIndex: number; questionsTotal: number; questionsCorrect: number };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { moduleIndex, questionsTotal, questionsCorrect } = body;
  if (typeof moduleIndex !== "number" || typeof questionsTotal !== "number" || typeof questionsCorrect !== "number") {
    return NextResponse.json({ error: "moduleIndex, questionsTotal, and questionsCorrect are required" }, { status: 400 });
  }
  if (questionsTotal < 1 || questionsCorrect < 0 || questionsCorrect > questionsTotal) {
    return NextResponse.json({ error: "Invalid score values" }, { status: 400 });
  }

  const score = Math.round((questionsCorrect / questionsTotal) * 100);
  const now = new Date();

  const [existing] = await db
    .select({ id: moduleQuizScores.id, score: moduleQuizScores.score, questionsTotal: moduleQuizScores.questionsTotal, questionsCorrect: moduleQuizScores.questionsCorrect })
    .from(moduleQuizScores)
    .where(and(eq(moduleQuizScores.courseId, courseId), eq(moduleQuizScores.userId, user.id), eq(moduleQuizScores.moduleIndex, moduleIndex)))
    .limit(1);

  if (existing) {
    const isNewBest = score >= existing.score;
    const finalScore = Math.max(existing.score, score);
    await db.update(moduleQuizScores).set({
      score: finalScore,
      questionsTotal: isNewBest ? questionsTotal : existing.questionsTotal ?? questionsTotal,
      questionsCorrect: isNewBest ? questionsCorrect : existing.questionsCorrect ?? questionsCorrect,
      completedAt: now,
      updatedAt: now,
    }).where(eq(moduleQuizScores.id, existing.id));
    if (isNewBest && finalScore >= 80) {
      awardXp(user.id, "quiz_pass", courseId).catch(() => {});
    }
    return NextResponse.json({ success: true, score: finalScore, isHighScore: isNewBest });
  }

  await db.insert(moduleQuizScores).values({
    courseId,
    userId: user.id,
    moduleIndex,
    score,
    questionsTotal,
    questionsCorrect,
    completedAt: now,
    updatedAt: now,
  });

  if (score >= 80) {
    awardXp(user.id, "quiz_pass", courseId).catch(() => {});
  }

  return NextResponse.json({ success: true, score });
}
