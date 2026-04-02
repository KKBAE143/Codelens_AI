export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { organizations, organizationMembers, users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const createOrgSchema = z.object({
  name: z.string().min(2).max(60),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "Slug must be 3-40 lowercase alphanumeric characters with hyphens"),
});

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

  const parsed = createOrgSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ") },
      { status: 400 }
    );
  }

  const { name, slug } = parsed.data;

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
