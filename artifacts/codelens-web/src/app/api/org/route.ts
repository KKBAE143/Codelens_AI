export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { organizations, organizationMembers, users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export async function POST(request: Request) {
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const [dbUser] = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!dbUser || dbUser.plan !== "team") {
    return NextResponse.json(
      { error: "Team features require a Team plan. Upgrade to create organizations." },
      { status: 403 }
    );
  }

  const { name, slug } = body;
  if (!name || typeof name !== "string" || name.length < 2 || name.length > 60) {
    return NextResponse.json({ error: "Name must be 2-60 characters" }, { status: 400 });
  }
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "Slug must be 3-40 lowercase alphanumeric characters with hyphens" },
      { status: 400 }
    );
  }

  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (existing) {
    return NextResponse.json({ error: "This slug is already taken" }, { status: 409 });
  }

  const [org] = await db
    .insert(organizations)
    .values({ name, slug, ownerId: user.id })
    .returning();

  await db.insert(organizationMembers).values({
    organizationId: org.id,
    userId: user.id,
    role: "owner",
    status: "active",
    invitedBy: user.id,
  });

  return NextResponse.json({ organization: org }, { status: 201 });
}
