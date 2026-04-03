export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import {
  learningPaths,
  learningPathCourses,
  learningPathAssignments,
  courses,
  courseProgress,
  users,
} from "@workspace/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";

const createPathSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  courseIds: z.array(z.string().uuid()).min(1).max(30),
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

  const paths = await db
    .select()
    .from(learningPaths)
    .where(eq(learningPaths.organizationId, result.org.id));

  const pathIds = paths.map((p) => p.id);
  let pathCourses: Array<typeof learningPathCourses.$inferSelect> = [];
  let pathAssigns: Array<typeof learningPathAssignments.$inferSelect> = [];

  if (pathIds.length > 0) {
    pathCourses = await db
      .select()
      .from(learningPathCourses)
      .where(inArray(learningPathCourses.learningPathId, pathIds));

    pathAssigns = await db
      .select()
      .from(learningPathAssignments)
      .where(inArray(learningPathAssignments.learningPathId, pathIds));
  }

  const enriched = paths.map((p) => ({
    ...p,
    courseIds: pathCourses
      .filter((pc) => pc.learningPathId === p.id)
      .sort((a, b) => a.position - b.position)
      .map((pc) => pc.courseId),
    assignmentCount: pathAssigns.filter((a) => a.learningPathId === p.id).length,
  }));

  return NextResponse.json({ learningPaths: enriched });
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

  const parsed = createPathSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const { name, description, courseIds } = parsed.data;

  const orgCourses = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.organizationId, result.org.id), isNull(courses.deletedAt)));

  const orgCourseIds = new Set(orgCourses.map((c) => c.id));
  const validCourseIds = courseIds.filter((id) => orgCourseIds.has(id));
  if (validCourseIds.length === 0) {
    return NextResponse.json({ error: "No valid courses provided" }, { status: 400 });
  }

  const [path] = await db
    .insert(learningPaths)
    .values({
      organizationId: result.org.id,
      name,
      description: description || null,
      createdBy: user.id,
    })
    .returning();

  await db.insert(learningPathCourses).values(
    validCourseIds.map((courseId, i) => ({
      learningPathId: path.id,
      courseId,
      position: i,
    }))
  );

  return NextResponse.json({ learningPath: { ...path, courseIds: validCourseIds } }, { status: 201 });
}
