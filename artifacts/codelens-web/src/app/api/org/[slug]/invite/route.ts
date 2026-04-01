export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import { users, organizationMembers } from "@workspace/db/schema";
import { eq, or, and, gt, sql } from "drizzle-orm";

class InviteError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

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

  let membership;
  try {
    membership = await db.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${"invite:" + org.id}))`,
      );

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const [recentInviteCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, org.id),
            gt(organizationMembers.joinedAt, oneHourAgo),
          ),
        );

      if ((recentInviteCount?.count ?? 0) >= 10) {
        throw new InviteError(
          "RATE_LIMIT",
          "Rate limit exceeded: max 10 invites per hour per organization",
          429,
        );
      }

      const [existingMembership] = await tx
        .select()
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, org.id),
            eq(organizationMembers.userId, targetUser.id),
          ),
        )
        .limit(1);

      if (existingMembership) {
        throw new InviteError(
          "ALREADY_MEMBER",
          "User is already a member or has a pending invitation",
          409,
        );
      }

      const activeMembers = await tx
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, org.id),
            eq(organizationMembers.status, "active"),
          ),
        );

      if (activeMembers.length >= org.maxMembers) {
        throw new InviteError(
          "MEMBER_LIMIT",
          `Organization has reached its member limit of ${org.maxMembers}`,
          403,
        );
      }

      const [m] = await tx
        .insert(organizationMembers)
        .values({
          organizationId: org.id,
          userId: targetUser.id,
          role: "member",
          status: "pending",
          invitedBy: user.id,
        })
        .returning();

      return m;
    });
  } catch (err) {
    if (err instanceof InviteError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  return NextResponse.json({ membership }, { status: 201 });
}
