export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { checkAndIncrementUsage } from "@/lib/rate-limit";
import { inngest, isInngestConfigured } from "@/lib/inngest";
import { generateCourseDirect } from "@/lib/jobs/generate-course-direct";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const regenerateCourseSchema = z.object({
  customContext: z.string().max(2000).optional(),
}).optional();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validated = regenerateCourseSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ") },
      { status: 400 }
    );
  }

  const { id } = await params;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const [originalCourse] = await db
    .select()
    .from(courses)
    .where(
      and(
        eq(courses.id, id),
        eq(courses.createdBy, user.id),
        isNull(courses.deletedAt)
      )
    )
    .limit(1);

  if (!originalCourse) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const rateLimit = await checkAndIncrementUsage(user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Monthly generation limit reached. Upgrade to Pro for unlimited generations.",
        remaining: rateLimit.remaining,
        resetAt: rateLimit.resetAt.toISOString(),
      },
      { status: 429 }
    );
  }

  const [newCourse] = await db
    .insert(courses)
    .values({
      githubUrl: originalCourse.githubUrl,
      repoName: originalCourse.repoName,
      ownerName: originalCourse.ownerName,
      defaultBranch: originalCourse.defaultBranch,
      targetAudience: originalCourse.targetAudience,
      status: "pending",
      createdBy: user.id,
      parentCourseId: originalCourse.id,
      version: originalCourse.version + 1,
      organizationId: originalCourse.organizationId,
    })
    .returning();

  if (isInngestConfigured()) {
    await inngest.send({
      name: "codelens/course.generate",
      data: { courseId: newCourse.id },
    });
  } else {
    generateCourseDirect(newCourse.id).catch((err) => {
      console.error("Direct course regeneration failed:", err);
    });
  }

  return NextResponse.json({
    courseId: newCourse.id,
    message: "Regeneration started",
    version: newCourse.version,
  });
}
