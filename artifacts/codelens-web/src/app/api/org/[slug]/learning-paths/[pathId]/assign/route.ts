export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership, getMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import { learningPaths, learningPathAssignments } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

const assignSchema = z.object({
  userIds: z.array(z.string()).min(1).max(50),
  dueDate: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; pathId: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { slug, pathId } = await params;
  const result = await requireOrgMembership(slug, user.id, "admin");
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const [path] = await db
    .select()
    .from(learningPaths)
    .where(and(eq(learningPaths.id, pathId), eq(learningPaths.organizationId, result.org.id)));

  if (!path) {
    return NextResponse.json({ error: "Learning path not found" }, { status: 404 });
  }

  const validUserIds: string[] = [];
  for (const uid of parsed.data.userIds) {
    const m = await getMembership(result.org.id, uid);
    if (m && m.status === "active") validUserIds.push(uid);
  }

  if (validUserIds.length === 0) {
    return NextResponse.json({ error: "No valid members to assign" }, { status: 400 });
  }

  const values = validUserIds.map((uid) => ({
    learningPathId: pathId,
    userId: uid,
    assignedBy: user.id,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
  }));

  await db
    .insert(learningPathAssignments)
    .values(values)
    .onConflictDoNothing();

  return NextResponse.json({ assigned: validUserIds.length }, { status: 201 });
}
