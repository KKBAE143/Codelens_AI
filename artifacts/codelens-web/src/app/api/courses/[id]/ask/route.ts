export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { courses, courseAssignments } from "@workspace/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { generateText } from "@/lib/llm";
import { parseV2Course } from "@/lib/course-types";

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
      html: courses.html,
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

  let body: { question: string; moduleTitle?: string; blockContent?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const { question, moduleTitle, blockContent } = body;
  if (typeof question !== "string" || !question.trim() || question.trim().length > 500) {
    return NextResponse.json({ error: "Question must be 1-500 characters" }, { status: 400 });
  }

  let abstractionContext = "";
  let moduleBlockContent = "";
  if (courseRecord.html) {
    try {
      const v2Data = parseV2Course(courseRecord.html);
      if (v2Data) {
        const abstractions = v2Data.modules.map((m) =>
          `- ${m.title || "Untitled"}${m.learningObjective ? `: ${m.learningObjective}` : ""}`
        ).slice(0, 20).join("\n");
        if (abstractions) abstractionContext = `\nCourse modules:\n${abstractions}`;

        if (moduleTitle) {
          const mod = v2Data.modules.find((m) => m.title === moduleTitle);
          if (mod) {
            const textBlocks = mod.blocks
              .filter((b) => b.type === "text" || b.type === "callout")
              .map((b) => {
                if (b.type === "text") return b.content.replace(/<[^>]+>/g, " ").slice(0, 500);
                if (b.type === "callout") return b.content.slice(0, 300);
                return "";
              })
              .filter(Boolean)
              .slice(0, 5);
            if (textBlocks.length) {
              moduleBlockContent = `\nCurrent module content excerpts:\n${textBlocks.join("\n---\n")}`;
            }
          }
        }
      }
    } catch {}
  }

  const contextParts = [
    `Repository: ${courseRecord.ownerName}/${courseRecord.repoName}`,
  ];
  if (moduleTitle) contextParts.push(`Current module: ${moduleTitle}`);
  if (blockContent) contextParts.push(`Content the learner is reading:\n${blockContent.slice(0, 1500)}`);
  if (abstractionContext) contextParts.push(abstractionContext);
  if (moduleBlockContent) contextParts.push(moduleBlockContent);

  const prompt = `You are a helpful coding tutor answering questions about the ${courseRecord.ownerName}/${courseRecord.repoName} codebase.

${contextParts.join("\n")}

The learner asks: "${question.trim()}"

Rules:
- Answer in 2-4 paragraphs maximum. Be concise and direct.
- Ground your answer in the codebase context provided. Reference specific files, modules, or abstractions when relevant.
- When referencing course content, cite the specific module name (e.g., "As covered in the 'Authentication Flow' module...").
- If you don't know the specific answer, explain the general concept and point to which module or file in the codebase would be relevant.
- Use simple language. Explain technical terms when first used.
- Include a brief code example only if directly relevant (≤10 lines).

Answer:`;

  try {
    const response = await generateText({
      task: "chat",
      prompt,
      maxOutputTokens: 1024,
    });

    return NextResponse.json({ answer: response.text.trim() });
  } catch (err) {
    console.error("[AI Q&A] Generation failed:", err);
    return NextResponse.json({ error: "Failed to generate answer. Please try again." }, { status: 500 });
  }
}
