export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull, desc, ilike, or, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawPage = parseInt(searchParams.get("page") || "1");
  const rawLimit = parseInt(searchParams.get("limit") || "20");
  const page = Number.isFinite(rawPage) ? Math.max(rawPage, 1) : 1;
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 50) : 20;
  const search = (searchParams.get("search") || "").slice(0, 200);
  const language = (searchParams.get("language") || "").slice(0, 50);
  const focusArea = (searchParams.get("focusArea") || "").slice(0, 100);
  const sort = ["recent", "views", "modules", "stars"].includes(searchParams.get("sort") || "") ? searchParams.get("sort")! : "recent";
  const offset = (page - 1) * limit;

  const conditions = [
    eq(courses.status, "completed"),
    eq(courses.isPublic, true),
    eq(courses.isPrivate, false),
    isNull(courses.deletedAt),
  ];

  if (search) {
    conditions.push(
      or(
        ilike(courses.repoName, `%${search}%`),
        ilike(courses.ownerName, `%${search}%`),
        ilike(courses.oneLiner, `%${search}%`),
      )!,
    );
  }

  if (language) {
    conditions.push(
      sql`${courses.techStack}->>'languages' ILIKE ${"%" + language + "%"}`,
    );
  }

  if (focusArea) {
    conditions.push(
      sql`${courses.focusAreas}::text ILIKE ${"%" + focusArea + "%"}`,
    );
  }

  let orderBy;
  switch (sort) {
    case "views":
      orderBy = desc(courses.viewCount);
      break;
    case "modules":
      orderBy = desc(courses.moduleCount);
      break;
    case "stars":
      orderBy = desc(sql`COALESCE(${courses.stars}, 0)`);
      break;
    default:
      orderBy = desc(courses.createdAt);
  }

  const results = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      githubUrl: courses.githubUrl,
      repoName: courses.repoName,
      ownerName: courses.ownerName,
      targetAudience: courses.targetAudience,
      techStack: courses.techStack,
      oneLiner: courses.oneLiner,
      difficulty: courses.difficulty,
      estimatedMinutes: courses.estimatedMinutes,
      moduleCount: courses.moduleCount,
      stars: courses.stars,
      focusAreas: courses.focusAreas,
      version: courses.version,
      createdAt: courses.createdAt,
      updatedAt: courses.updatedAt,
      viewCount: courses.viewCount,
    })
    .from(courses)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(courses)
    .where(and(...conditions));

  const totalCount = countResult?.count || 0;
  const totalPages = Math.ceil(totalCount / limit);

  return NextResponse.json({
    courses: results,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasMore: page < totalPages,
    },
  });
}
