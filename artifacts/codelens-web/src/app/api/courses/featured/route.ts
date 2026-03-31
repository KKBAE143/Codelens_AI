export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";

export async function GET() {
  try {
    const results = await db
      .select({
        id: courses.id,
        repoName: courses.repoName,
        ownerName: courses.ownerName,
        oneLiner: courses.oneLiner,
        difficulty: courses.difficulty,
        estimatedMinutes: courses.estimatedMinutes,
        moduleCount: courses.moduleCount,
        techStack: courses.techStack,
        stars: courses.stars,
        viewCount: courses.viewCount,
        updatedAt: courses.updatedAt,
        targetAudience: courses.targetAudience,
      })
      .from(courses)
      .where(
        and(
          eq(courses.status, "completed"),
          eq(courses.isPublic, true),
          eq(courses.isPrivate, false),
          isNull(courses.deletedAt),
        ),
      )
      .orderBy(desc(sql`COALESCE(${courses.viewCount}, 0) + COALESCE(${courses.stars}, 0) * 2`))
      .limit(6);

    return NextResponse.json({ courses: results });
  } catch {
    return NextResponse.json({ courses: [] });
  }
}
