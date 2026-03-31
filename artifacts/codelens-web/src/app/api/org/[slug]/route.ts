export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import {
  organizationMembers,
  courses,
  courseAssignments,
  courseProgress,
  users,
} from "@workspace/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { slug } = await params;
  const result = await requireOrgMembership(slug, user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { org } = result;

  const members = await db
    .select({
      id: organizationMembers.id,
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      status: organizationMembers.status,
      joinedAt: organizationMembers.joinedAt,
      username: users.username,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      email: users.email,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, org.id));

  const orgCourses = await db
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.organizationId, org.id),
        isNull(courses.deletedAt)
      )
    );

  const assignments = await db
    .select()
    .from(courseAssignments)
    .where(eq(courseAssignments.organizationId, org.id));

  const orgCourseIds = orgCourses.map((c) => c.id);
  const assignedUserIds = [...new Set(assignments.map((a) => a.assignedTo))];

  let progressRecords: Array<typeof courseProgress.$inferSelect> = [];
  if (orgCourseIds.length > 0 && assignedUserIds.length > 0) {
    progressRecords = await db
      .select()
      .from(courseProgress)
      .where(
        and(
          inArray(courseProgress.courseId, orgCourseIds),
          inArray(courseProgress.userId, assignedUserIds)
        )
      );
  }

  const assignmentsWithProgress = assignments.map((a) => {
    const prog = progressRecords.find(
      (p) => p.courseId === a.courseId && p.userId === a.assignedTo
    );
    let status: "not_started" | "in_progress" | "completed" = "not_started";
    let percentComplete = 0;
    if (prog) {
      percentComplete = prog.percentComplete;
      if (prog.percentComplete >= 100) {
        status = "completed";
      } else if (prog.percentComplete > 0) {
        status = "in_progress";
      }
    }
    return { ...a, status, percentComplete };
  });

  const activeMembers = members.filter((m) => m.status === "active");
  const totalAssignments = assignments.length;
  const completedAssignments = assignmentsWithProgress.filter((a) => a.status === "completed").length;

  return NextResponse.json({
    organization: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      ownerId: org.ownerId,
      slackWebhookUrl: org.slackWebhookUrl ? "configured" : null,
      maxMembers: org.maxMembers,
    },
    members,
    courses: orgCourses.map((c) => ({
      id: c.id,
      repoName: c.repoName,
      ownerName: c.ownerName,
      targetAudience: c.targetAudience,
      status: c.status,
      oneLiner: c.oneLiner,
      difficulty: c.difficulty,
      estimatedMinutes: c.estimatedMinutes,
      moduleCount: c.moduleCount,
      createdBy: c.createdBy,
      createdAt: c.createdAt,
    })),
    assignments: assignmentsWithProgress,
    stats: {
      memberCount: activeMembers.length,
      courseCount: orgCourses.length,
      totalAssignments,
      completedAssignments,
      completionRate: totalAssignments > 0
        ? Math.round((completedAssignments / totalAssignments) * 100)
        : 0,
    },
  });
}
