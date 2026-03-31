export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import { users, organizationMembers } from "@workspace/db/schema";
import { eq, or, and } from "drizzle-orm";

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

  const { org } = result;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { usernameOrEmail } = body;
  if (!usernameOrEmail || typeof usernameOrEmail !== "string") {
    return NextResponse.json({ error: "Username or email is required" }, { status: 400 });
  }

  const [targetUser] = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.username, usernameOrEmail),
        eq(users.email, usernameOrEmail)
      )
    )
    .limit(1);

  if (!targetUser) {
    return NextResponse.json(
      { error: "User not found. They must sign in to CodeLens AI first." },
      { status: 404 }
    );
  }

  const [existingMembership] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, org.id),
        eq(organizationMembers.userId, targetUser.id)
      )
    )
    .limit(1);

  if (existingMembership) {
    return NextResponse.json(
      { error: "User is already a member or has a pending invitation" },
      { status: 409 }
    );
  }

  const activeMembers = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, org.id),
        eq(organizationMembers.status, "active")
      )
    );

  if (activeMembers.length >= org.maxMembers) {
    return NextResponse.json(
      { error: `Organization has reached its member limit of ${org.maxMembers}` },
      { status: 403 }
    );
  }

  const [membership] = await db
    .insert(organizationMembers)
    .values({
      organizationId: org.id,
      userId: targetUser.id,
      role: "member",
      status: "pending",
      invitedBy: user.id,
    })
    .returning();

  return NextResponse.json({ membership }, { status: 201 });
}
