export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareToken: string }> }
) {
  const { shareToken } = await params;

  const [course] = await db
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.shareToken, shareToken),
        eq(courses.isPublic, true),
        eq(courses.status, "completed"),
        isNull(courses.deletedAt)
      )
    )
    .limit(1);

  if (!course) {
    return NextResponse.json({ error: "Course not found or not public" }, { status: 404 });
  }

  return NextResponse.json({
    course: {
      id: course.id,
      slug: course.slug,
      repoName: course.repoName,
      ownerName: course.ownerName,
      targetAudience: course.targetAudience,
      techStack: course.techStack,
      oneLiner: course.oneLiner,
      difficulty: course.difficulty,
      estimatedMinutes: course.estimatedMinutes,
      moduleCount: course.moduleCount,
      html: course.html,
      version: course.version,
      createdAt: course.createdAt,
    },
  });
}
