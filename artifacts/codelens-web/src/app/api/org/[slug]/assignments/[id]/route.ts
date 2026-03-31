export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import { courseAssignments } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { slug, id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid assignment ID" }, { status: 400 });
  }

  const result = await requireOrgMembership(slug, user.id, "admin");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { org } = result;

  await db
    .delete(courseAssignments)
    .where(
      and(
        eq(courseAssignments.id, id),
        eq(courseAssignments.organizationId, org.id)
      )
    );

  return NextResponse.json({ success: true });
}
