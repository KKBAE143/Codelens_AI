export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import {
  courseAssignments,
  courses,
  organizations,
  organizationMembers,
  users,
} from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { sendSlackNotification, courseAssignedMessage } from "@/lib/slack";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
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

  const url = new URL(request.url);
  const assignedTo = url.searchParams.get("assignedTo");
  const courseId = url.searchParams.get("courseId");

  let conditions = [eq(courseAssignments.organizationId, org.id)];
  if (assignedTo) conditions.push(eq(courseAssignments.assignedTo, assignedTo));
  if (courseId && UUID_RE.test(courseId))
    conditions.push(eq(courseAssignments.courseId, courseId));

  const assignments = await db
    .select()
    .from(courseAssignments)
    .where(and(...conditions));

  return NextResponse.json({ assignments });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { slug } = await params;
  const result = await requireOrgMembership(slug, user.id, "admin");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { org } = result;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { courseId, assignedTo, dueDate, note } = body;

  if (!courseId || !UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Valid courseId is required" }, { status: 400 });
  }
  if (!assignedTo || typeof assignedTo !== "string") {
    return NextResponse.json({ error: "assignedTo (userId) is required" }, { status: 400 });
  }

  const [course] = await db
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.id, courseId),
        eq(courses.organizationId, org.id),
        isNull(courses.deletedAt)
      )
    )
    .limit(1);

  if (!course) {
    return NextResponse.json({ error: "Course not found in this organization" }, { status: 404 });
  }

  const [targetMember] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, org.id),
        eq(organizationMembers.userId, assignedTo),
        eq(organizationMembers.status, "active")
      )
    )
    .limit(1);

  if (!targetMember) {
    return NextResponse.json({ error: "User is not an active member of this organization" }, { status: 400 });
  }

  const [assignment] = await db
    .insert(courseAssignments)
    .values({
      courseId,
      assignedTo,
      assignedBy: user.id,
      organizationId: org.id,
      dueDate: dueDate ? new Date(dueDate) : null,
      note: note || null,
    })
    .returning();

  if (org.slackWebhookUrl) {
    const [member] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, assignedTo))
      .limit(1);
    const memberName = member?.displayName || "team member";
    const dueDateStr = dueDate
      ? new Date(dueDate).toLocaleDateString()
      : undefined;

    sendSlackNotification(
      org.slackWebhookUrl,
      courseAssignedMessage(
        `${course.ownerName}/${course.repoName}`,
        user.displayName,
        memberName,
        dueDateStr
      )
    ).catch(() => {});
  }

  return NextResponse.json({ assignment }, { status: 201 });
}
