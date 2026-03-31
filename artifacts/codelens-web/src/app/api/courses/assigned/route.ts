export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courseAssignments, courses, organizations } from "@workspace/db/schema";
import { eq, and, isNull, asc } from "drizzle-orm";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  if (user.plan !== "team") {
    return NextResponse.json({ assignments: [] });
  }

  const assignments = await db
    .select({
      id: courseAssignments.id,
      courseId: courseAssignments.courseId,
      dueDate: courseAssignments.dueDate,
      note: courseAssignments.note,
      createdAt: courseAssignments.createdAt,
      repoName: courses.repoName,
      ownerName: courses.ownerName,
      orgName: organizations.name,
    })
    .from(courseAssignments)
    .innerJoin(courses, and(eq(courses.id, courseAssignments.courseId), isNull(courses.deletedAt)))
    .innerJoin(organizations, eq(organizations.id, courseAssignments.organizationId))
    .where(eq(courseAssignments.assignedTo, user.id))
    .orderBy(asc(courseAssignments.dueDate));

  return NextResponse.json({ assignments });
}
