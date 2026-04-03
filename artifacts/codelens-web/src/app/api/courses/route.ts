export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { unauthorized, badRequest } from "@/lib/api-errors";
import { db } from "@workspace/db";
import { courses, organizationMembers, webhookRegistrations, courseProgress } from "@workspace/db/schema";
import { eq, and, isNull, desc, lt, or, inArray, sql } from "drizzle-orm";

const courseListColumns = {
  id: courses.id,
  slug: courses.slug,
  githubUrl: courses.githubUrl,
  repoName: courses.repoName,
  ownerName: courses.ownerName,
  targetAudience: courses.targetAudience,
  status: courses.status,
  progress: courses.progress,
  techStack: courses.techStack,
  oneLiner: courses.oneLiner,
  difficulty: courses.difficulty,
  estimatedMinutes: courses.estimatedMinutes,
  moduleCount: courses.moduleCount,
  isPublic: courses.isPublic,
  shareToken: courses.shareToken,
  version: courses.version,
  changesSince: courses.changesSince,
  errorMessage: courses.errorMessage,
  createdBy: courses.createdBy,
  organizationId: courses.organizationId,
  createdAt: courses.createdAt,
  updatedAt: courses.updatedAt,
};

export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return unauthorized("Authentication required");
  }

  const searchParams = request.nextUrl.searchParams;
  const cursor = searchParams.get("cursor");
  const parsedLimit = parseInt(searchParams.get("limit") || "20");
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 20;

  const userOrgMemberships = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, user.id),
        eq(organizationMembers.status, "active")
      )
    );

  const orgIds = userOrgMemberships.map((m) => m.organizationId);

  const ownershipCondition =
    orgIds.length > 0
      ? or(
          eq(courses.createdBy, user.id),
          and(
            inArray(courses.organizationId, orgIds),
            eq(courses.isPublic, true)
          )
        )
      : eq(courses.createdBy, user.id);

  const conditions = [ownershipCondition!, isNull(courses.deletedAt)];

  if (cursor) {
    const cursorDate = new Date(cursor);
    if (isNaN(cursorDate.getTime())) {
      return badRequest("Invalid cursor");
    }
    conditions.push(lt(courses.createdAt, cursorDate));
  }

  const results = await db
    .select({
      ...courseListColumns,
      hasWebhook: sql<boolean>`CASE WHEN ${webhookRegistrations.id} IS NOT NULL THEN true ELSE false END`.as("has_webhook"),
      webhookAutoRegenerate: webhookRegistrations.autoRegenerate,
      lastSeenVersion: sql<number>`COALESCE(${courseProgress.lastSeenVersion}, 0)`.as("last_seen_version"),
      percentComplete: sql<number>`COALESCE(${courseProgress.percentComplete}, 0)`.as("percent_complete"),
      lastViewedAt: courseProgress.lastViewedAt,
    })
    .from(courses)
    .leftJoin(webhookRegistrations, eq(courses.id, webhookRegistrations.courseId))
    .leftJoin(
      courseProgress,
      and(
        eq(courses.id, courseProgress.courseId),
        eq(courseProgress.userId, user.id)
      )
    )
    .where(and(...conditions))
    .orderBy(desc(courses.createdAt))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore ? items[items.length - 1].createdAt.toISOString() : null;

  return NextResponse.json({
    courses: items,
    nextCursor,
    hasMore,
  });
}
