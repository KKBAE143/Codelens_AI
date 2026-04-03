export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { organizations, organizationMembers } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const myOrgs = await db
    .select({
      slug: organizations.slug,
      name: organizations.name,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(organizationMembers.userId, user.id),
        eq(organizationMembers.status, "active")
      )
    );

  return NextResponse.json({ organizations: myOrgs });
}
