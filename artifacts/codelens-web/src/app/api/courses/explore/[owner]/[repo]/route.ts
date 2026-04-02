export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { parseV2Course } from "@/lib/course-types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const { owner, repo } = await params;

  if (!owner || !repo) {
    return NextResponse.json({ error: "Missing owner or repo" }, { status: 400 });
  }

  const [course] = await db
    .select({
      id: courses.id,
      repoName: courses.repoName,
      ownerName: courses.ownerName,
      githubUrl: courses.githubUrl,
      targetAudience: courses.targetAudience,
      techStack: courses.techStack,
      oneLiner: courses.oneLiner,
      difficulty: courses.difficulty,
      estimatedMinutes: courses.estimatedMinutes,
      moduleCount: courses.moduleCount,
      stars: courses.stars,
      focusAreas: courses.focusAreas,
      html: courses.html,
      version: courses.version,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
      viewCount: courses.viewCount,
    })
    .from(courses)
    .where(
      and(
        sql`LOWER(${courses.ownerName}) = ${owner.toLowerCase()}`,
        sql`LOWER(${courses.repoName}) = ${repo.toLowerCase()}`,
        eq(courses.status, "completed"),
        eq(courses.isPublic, true),
        eq(courses.isPrivate, false),
        isNull(courses.deletedAt),
      ),
    )
    .limit(1);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const v2Data = course.html ? parseV2Course(course.html) : null;

  return NextResponse.json({
    course: {
      ...course,
      html: v2Data ? null : course.html,
      v2Data,
    },
  });
}
