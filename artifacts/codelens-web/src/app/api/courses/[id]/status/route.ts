export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const [course] = await db
    .select({
      status: courses.status,
      progress: courses.progress,
      errorMessage: courses.errorMessage,
      createdBy: courses.createdBy,
    })
    .from(courses)
    .where(and(eq(courses.id, id), isNull(courses.deletedAt)))
    .limit(1);

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  if (course.createdBy !== user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  return NextResponse.json({
    status: course.status,
    progress: course.progress || { stage: "pending", detail: "Waiting to start...", percent: 0 },
    errorMessage: course.status === "failed" ? course.errorMessage : undefined,
  });
}
