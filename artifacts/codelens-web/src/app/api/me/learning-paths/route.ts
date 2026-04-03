export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import {
  learningPathAssignments,
  learningPaths,
  learningPathCourses,
  courseProgress,
  courses,
  organizations,
} from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const assignments = await db
    .select()
    .from(learningPathAssignments)
    .where(eq(learningPathAssignments.userId, user.id));

  if (assignments.length === 0) {
    return NextResponse.json({ learningPaths: [] });
  }

  const pathIds = [...new Set(assignments.map((a) => a.learningPathId))];

  const paths = await db
    .select()
    .from(learningPaths)
    .where(inArray(learningPaths.id, pathIds));

  const pathCourses = await db
    .select()
    .from(learningPathCourses)
    .where(inArray(learningPathCourses.learningPathId, pathIds));

  const courseIds = [...new Set(pathCourses.map((pc) => pc.courseId))];
  let coursesData: Array<typeof courses.$inferSelect> = [];
  let progressData: Array<typeof courseProgress.$inferSelect> = [];

  if (courseIds.length > 0) {
    coursesData = await db
      .select()
      .from(courses)
      .where(inArray(courses.id, courseIds));

    progressData = await db
      .select()
      .from(courseProgress)
      .where(
        inArray(courseProgress.courseId, courseIds)
      );
    progressData = progressData.filter((p) => p.userId === user.id);
  }

  const orgIds = [...new Set(paths.map((p) => p.organizationId))];
  let orgsData: Array<typeof organizations.$inferSelect> = [];
  if (orgIds.length > 0) {
    orgsData = await db.select().from(organizations).where(inArray(organizations.id, orgIds));
  }

  const enriched = paths.map((path) => {
    const assignment = assignments.find((a) => a.learningPathId === path.id);
    const pCourses = pathCourses
      .filter((pc) => pc.learningPathId === path.id)
      .sort((a, b) => a.position - b.position);

    const coursesWithProgress = pCourses.map((pc) => {
      const course = coursesData.find((c) => c.id === pc.courseId);
      const prog = progressData.find((p) => p.courseId === pc.courseId);
      return {
        courseId: pc.courseId,
        position: pc.position,
        repoName: course?.repoName || "Unknown",
        ownerName: course?.ownerName || "",
        oneLiner: course?.oneLiner || null,
        percentComplete: prog?.percentComplete || 0,
      };
    });

    const totalPercent = coursesWithProgress.length > 0
      ? Math.round(
          coursesWithProgress.reduce((s, c) => s + c.percentComplete, 0) / coursesWithProgress.length
        )
      : 0;

    const org = orgsData.find((o) => o.id === path.organizationId);

    return {
      id: path.id,
      name: path.name,
      description: path.description,
      organizationName: org?.name || "Unknown",
      dueDate: assignment?.dueDate,
      completedAt: assignment?.completedAt,
      courses: coursesWithProgress,
      totalPercent,
    };
  });

  return NextResponse.json({ learningPaths: enriched });
}
