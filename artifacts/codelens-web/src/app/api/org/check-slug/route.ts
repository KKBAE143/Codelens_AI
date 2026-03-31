export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { organizations } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const slug = request.nextUrl.searchParams.get("slug");
  if (!slug || typeof slug !== "string" || slug.length < 2) {
    return NextResponse.json({ available: false, reason: "Slug must be at least 2 characters" });
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ available: false, reason: "Only lowercase letters, numbers, and hyphens" });
  }

  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (existing) {
    return NextResponse.json({ available: false, reason: "This slug is already taken" });
  }

  return NextResponse.json({ available: true });
}
