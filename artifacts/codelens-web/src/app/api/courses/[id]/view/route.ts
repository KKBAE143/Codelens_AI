export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@workspace/db";
import { courses, courseViews } from "@workspace/db/schema";
import { eq, sql, and, gt } from "drizzle-orm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;

  if (!courseId || !/^[0-9a-f-]{36}$/.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  let visitorId = "anonymous";
  try {
    const body = await request.json();
    if (body.visitorId && typeof body.visitorId === "string") {
      visitorId = body.visitorId.slice(0, 64);
    }
  } catch {
    visitorId = "anonymous";
  }

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${courseId} || ':' || ${visitorId}))`,
      );

      const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [existing] = await tx
        .select({ id: courseViews.id })
        .from(courseViews)
        .where(
          and(
            eq(courseViews.courseId, courseId),
            eq(courseViews.visitorId, visitorId),
            gt(courseViews.createdAt, windowStart),
          ),
        )
        .limit(1);

      if (existing) {
        return;
      }

      await tx.insert(courseViews).values({ courseId, visitorId });

      await tx
        .update(courses)
        .set({ viewCount: sql`${courses.viewCount} + 1` })
        .where(eq(courses.id, courseId));
    });
  } catch (err) {
    console.warn("[Views] Failed to record view:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ ok: true });
}
