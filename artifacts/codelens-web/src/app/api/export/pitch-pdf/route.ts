export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { users } from "@workspace/db/schema";
import { count, isNull } from "drizzle-orm";
import { buildPitchDocumentHtml } from "@/components/PitchDocument";
import { buildPitchCheatSheetHtml } from "@/components/PitchCheatSheet";

async function fetchPlatformStats() {
  const [courseStats] = await db
    .select({ total: count() })
    .from(courses)
    .where(isNull(courses.deletedAt));

  const [generationStats] = await db
    .select({ total: count() })
    .from(courses);

  const [userStats] = await db
    .select({ total: count() })
    .from(users);

  return {
    totalCourses: courseStats?.total ?? 0,
    generationCount: generationStats?.total ?? 0,
    totalUsers: userStats?.total ?? 0,
  };
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "cheatsheet" ? "cheatsheet" : "full";

  const stats = await fetchPlatformStats();
  const html = mode === "cheatsheet"
    ? buildPitchCheatSheetHtml(stats)
    : buildPitchDocumentHtml(stats);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="codelens-ai-pitch${mode === "cheatsheet" ? "-cheatsheet" : ""}.html"`,
    },
  });
}
