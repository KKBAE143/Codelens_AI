export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ exists: false });
  }

  const normalized = url.replace(/\.git$/, "").replace(/\/$/, "").toLowerCase();
  const match = normalized.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  if (!match) {
    return NextResponse.json({ exists: false });
  }

  const [, owner, repo] = match;

  const [existing] = await db
    .select({
      id: courses.id,
      repoName: courses.repoName,
      ownerName: courses.ownerName,
      estimatedMinutes: courses.estimatedMinutes,
      moduleCount: courses.moduleCount,
      oneLiner: courses.oneLiner,
      updatedAt: courses.updatedAt,
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

  if (existing) {
    return NextResponse.json({
      exists: true,
      course: existing,
      exploreUrl: `/explore/${existing.ownerName}/${existing.repoName}`,
    });
  }

  return NextResponse.json({ exists: false });
}
