export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import {
  orgRequiredSkills,
  userSkills,
  organizationMembers,
  courses,
  users,
} from "@workspace/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";

const addSkillSchema = z.object({
  skill: z.string().min(1).max(80),
  roleLabel: z.string().max(60).optional(),
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

  const required = await db
    .select()
    .from(orgRequiredSkills)
    .where(eq(orgRequiredSkills.organizationId, result.org.id));

  const members = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, result.org.id),
        eq(organizationMembers.status, "active")
      )
    );

  const memberIds = members.map((m) => m.userId);

  let memberSkills: Array<typeof userSkills.$inferSelect> = [];
  if (memberIds.length > 0) {
    memberSkills = await db
      .select()
      .from(userSkills)
      .where(inArray(userSkills.userId, memberIds));
  }

  const orgCourses = await db
    .select({ id: courses.id, repoName: courses.repoName, skillTags: courses.skillTags })
    .from(courses)
    .where(and(eq(courses.organizationId, result.org.id), isNull(courses.deletedAt)));

  const availableSkills = new Set<string>();
  orgCourses.forEach((c) => {
    if (c.skillTags && Array.isArray(c.skillTags)) {
      c.skillTags.forEach((s: string) => availableSkills.add(s));
    }
  });

  const gapAnalysis = required.map((req) => {
    const membersWithSkill = memberSkills.filter((ms) => ms.skill === req.skill).map((ms) => ms.userId);
    const membersWithout = memberIds.filter((id) => !membersWithSkill.includes(id));
    return {
      skill: req.skill,
      roleLabel: req.roleLabel,
      totalMembers: memberIds.length,
      membersWithSkill: membersWithSkill.length,
      membersWithout: membersWithout.length,
      coveragePercent: memberIds.length > 0
        ? Math.round((membersWithSkill.length / memberIds.length) * 100)
        : 0,
    };
  });

  return NextResponse.json({
    requiredSkills: required,
    memberSkills,
    availableSkills: [...availableSkills],
    gapAnalysis,
    courseSkillMap: orgCourses.map((c) => ({ courseId: c.id, repoName: c.repoName, skills: c.skillTags || [] })),
  });
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

  const parsed = addSkillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const [skill] = await db
    .insert(orgRequiredSkills)
    .values({
      organizationId: result.org.id,
      skill: parsed.data.skill,
      roleLabel: parsed.data.roleLabel || null,
    })
    .onConflictDoNothing()
    .returning();

  return NextResponse.json({ skill: skill || { skill: parsed.data.skill } }, { status: 201 });
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
    return NextResponse.json({ error: "Missing skill ID" }, { status: 400 });
  }

  await db.delete(orgRequiredSkills).where(
    and(eq(orgRequiredSkills.id, id), eq(orgRequiredSkills.organizationId, result.org.id))
  );

  return NextResponse.json({ success: true });
}
