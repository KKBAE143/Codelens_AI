export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership, getMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import { mentorAssignments, users } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const createMentorSchema = z.object({
  mentorUserId: z.string(),
  learnerUserId: z.string(),
  courseId: z.string().uuid().optional(),
  learningPathId: z.string().uuid().optional(),
});

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

  const assignments = await db
    .select({
      id: mentorAssignments.id,
      mentorUserId: mentorAssignments.mentorUserId,
      learnerUserId: mentorAssignments.learnerUserId,
      courseId: mentorAssignments.courseId,
      learningPathId: mentorAssignments.learningPathId,
      createdAt: mentorAssignments.createdAt,
    })
    .from(mentorAssignments)
    .where(eq(mentorAssignments.organizationId, result.org.id));

  const userIds = [...new Set(assignments.flatMap((a) => [a.mentorUserId, a.learnerUserId]))];
  let userMap: Record<string, { displayName: string; username: string; avatarUrl: string | null }> = {};
  if (userIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const usersData = await db
      .select({ id: users.id, displayName: users.displayName, username: users.username, avatarUrl: users.avatarUrl })
      .from(users)
      .where(inArray(users.id, userIds));
    userMap = Object.fromEntries(usersData.map((u) => [u.id, u]));
  }

  const enriched = assignments.map((a) => ({
    ...a,
    mentor: userMap[a.mentorUserId] || null,
    learner: userMap[a.learnerUserId] || null,
  }));

  return NextResponse.json({ mentorAssignments: enriched });
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createMentorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { mentorUserId, learnerUserId, courseId, learningPathId } = parsed.data;

  const mentorMembership = await getMembership(result.org.id, mentorUserId);
  const learnerMembership = await getMembership(result.org.id, learnerUserId);

  if (!mentorMembership || mentorMembership.status !== "active") {
    return NextResponse.json({ error: "Mentor is not an active member" }, { status: 400 });
  }
  if (!learnerMembership || learnerMembership.status !== "active") {
    return NextResponse.json({ error: "Learner is not an active member" }, { status: 400 });
  }

  const [assignment] = await db
    .insert(mentorAssignments)
    .values({
      organizationId: result.org.id,
      mentorUserId,
      learnerUserId,
      courseId: courseId || null,
      learningPathId: learningPathId || null,
      assignedBy: user.id,
    })
    .returning();

  return NextResponse.json({ mentorAssignment: assignment }, { status: 201 });
}

export async function DELETE(
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

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing assignment ID" }, { status: 400 });
  }

  await db.delete(mentorAssignments).where(
    and(eq(mentorAssignments.id, id), eq(mentorAssignments.organizationId, result.org.id))
  );

  return NextResponse.json({ success: true });
}
