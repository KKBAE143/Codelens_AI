export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull, desc, ilike, or, sql } from "drizzle-orm";

const exploreQuerySchema = z.object({
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  sort: z.enum(["recent", "views", "modules", "stars"]).default("recent"),
  language: z.string().max(50).optional(),
  focusArea: z.string().max(100).optional(),
  audience: z.enum(["vibe_coder", "new_engineer", "product_manager", "security_auditor"]).optional(),
  depth: z.enum(["quick", "full", "deep"]).optional(),
});

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawQuery: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    rawQuery[key] = value;
  }

  const parsed = exploreQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ") },
      { status: 400 }
    );
  }

  const { q: search, page = 1, limit = 20, sort = "recent", language, focusArea, audience, depth } = parsed.data;
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
        ilike(courses.githubUrl, `%${search}%`),
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

  if (audience) {
    conditions.push(eq(courses.targetAudience, audience));
  }

  if (depth) {
    conditions.push(eq(courses.depthPreset, depth));
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
      depthPreset: courses.depthPreset,
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
