export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courses, courseAssignments } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { generateText } from "@/lib/llm";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try { user = await requireAuth(); }
  catch { return NextResponse.json({ error: "Authentication required" }, { status: 401 }); }

  const { id: courseId } = await params;
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: "Invalid course ID" }, { status: 400 });
  }

  const [courseRecord] = await db
    .select({
      id: courses.id,
      createdBy: courses.createdBy,
      isPublic: courses.isPublic,
      organizationId: courses.organizationId,
      repoName: courses.repoName,
      ownerName: courses.ownerName,
      targetAudience: courses.targetAudience,
    })
    .from(courses)
    .where(and(eq(courses.id, courseId), isNull(courses.deletedAt)))
    .limit(1);

  if (!courseRecord) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  let hasAccess = courseRecord.createdBy === user.id || courseRecord.isPublic;
  if (!hasAccess && courseRecord.organizationId) {
    const [assignment] = await db
      .select({ id: courseAssignments.id })
      .from(courseAssignments)
      .where(and(eq(courseAssignments.courseId, courseId), eq(courseAssignments.assignedTo, user.id)))
      .limit(1);
    if (assignment) hasAccess = true;
  }
  if (!hasAccess) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  let body: { blockContent: string; blockType: string; moduleTitle?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { blockContent, blockType, moduleTitle } = body;
  if (typeof blockContent !== "string" || !blockContent.trim()) {
    return NextResponse.json({ error: "blockContent is required" }, { status: 400 });
  }

  const prompt = `A learner studying the ${courseRecord.ownerName}/${courseRecord.repoName} codebase clicked "I'm Confused" on a ${blockType || "content"} block${moduleTitle ? ` in the "${moduleTitle}" module` : ""}.

The content they found confusing:
"""
${blockContent.slice(0, 2000)}
"""

Rewrite this explanation using a completely different approach:
1. Start with a simple real-world analogy that makes the core concept click
2. Break down the explanation into numbered steps, each 1-2 sentences
3. Use the simplest possible language — explain it like the reader has never seen this pattern before
4. If code is involved, explain what each line does in plain English
5. End with a "The key thing to remember" one-liner

Keep the total response under 300 words. Be warm and encouraging — they're learning.`;

  try {
    const response = await generateText({
      task: "chat",
      prompt,
      maxOutputTokens: 768,
    });

    return NextResponse.json({ explanation: response.text.trim() });
  } catch (err) {
    console.error("[Explain] Generation failed:", err);
    return NextResponse.json({ error: "Failed to generate explanation. Please try again." }, { status: 500 });
  }
}
