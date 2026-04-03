export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { organizationMembers, organizations, users as usersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const pendingInvitations = await db
    .select({
      id: organizationMembers.id,
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      invitedByName: usersTable.displayName,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .leftJoin(usersTable, eq(usersTable.id, organizationMembers.invitedBy))
    .where(
      and(
        eq(organizationMembers.userId, user.id),
        eq(organizationMembers.status, "pending")
      )
    );

  return NextResponse.json({ invitations: pendingInvitations });
}

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

  const { invitationId, action } = body;
  if (!invitationId || !["accept", "decline"].includes(action)) {
    return NextResponse.json({ error: "invitationId and action (accept/decline) required" }, { status: 400 });
  }

  const [invitation] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.id, invitationId),
        eq(organizationMembers.userId, user.id),
        eq(organizationMembers.status, "pending")
      )
    )
    .limit(1);

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (action === "accept") {
    await db
      .update(organizationMembers)
      .set({ status: "active", joinedAt: new Date() })
      .where(eq(organizationMembers.id, invitationId));
    return NextResponse.json({ success: true, status: "active" });
  }

  await db
    .delete(organizationMembers)
    .where(eq(organizationMembers.id, invitationId));

  return NextResponse.json({ success: true, status: "declined" });
}
