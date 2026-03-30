import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { extractRepo } from "../github";
import { runStage1, runStage2, runStage3 } from "../ai-pipeline";
import { registerWebhook } from "../github-webhooks";
import type { TargetAudience } from "../prompts";
import crypto from "crypto";

function generateSlug(repoName: string, owner: string): string {
  const base = `${owner}-${repoName}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

async function updateProgress(
  courseId: string,
  stage: string,
  detail: string,
  percent: number
) {
  await db
    .update(courses)
    .set({
      progress: { stage, detail, percent },
      updatedAt: new Date(),
    })
    .where(eq(courses.id, courseId));
}

export async function generateCourseDirect(courseId: string): Promise<void> {
  const [course] = await db
    .select()
    .from(courses)
    .where(eq(courses.id, courseId))
    .limit(1);

  if (!course) throw new Error(`Course ${courseId} not found`);

  await db
    .update(courses)
    .set({
      status: "generating",
      updatedAt: new Date(),
    })
    .where(eq(courses.id, courseId));

  await updateProgress(courseId, "extracting", "Fetching repository contents from GitHub...", 5);

  let extraction;
  try {
    extraction = await extractRepo(course.githubUrl, course.createdBy ?? undefined);
    await updateProgress(
      courseId,
      "extracting",
      `Read ${extraction.files.length} files from ${extraction.owner}/${extraction.repoName}`,
      15
    );
  } catch (error) {
    await db
      .update(courses)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Failed to extract repository",
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));
    throw error;
  }

  let analysis;
  try {
    await updateProgress(courseId, "analyzing", "Analyzing codebase architecture and patterns...", 25);
    const result = await runStage1(
      extraction.fileTree,
      extraction.files,
      extraction.languageBreakdown,
      course.targetAudience as TargetAudience
    );
    await updateProgress(courseId, "analyzing", result.progressDetail, 45);
    await db
      .update(courses)
      .set({
        analysis: result.data,
        techStack: (result.data.tech_stack as Record<string, unknown>) ?? null,
        oneLiner: (result.data.one_liner as string) ?? null,
        difficulty: (result.data.difficulty_assessment as string) ?? null,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));
    analysis = result.data;
  } catch (error) {
    await db
      .update(courses)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "AI analysis failed",
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));
    throw error;
  }

  let curriculum;
  try {
    await updateProgress(courseId, "designing", "Designing interactive curriculum...", 55);
    const result = await runStage2(analysis, course.targetAudience as TargetAudience);
    await updateProgress(courseId, "designing", result.progressDetail, 70);
    const modules = (result.data.modules as unknown[]) || [];
    const estimatedMinutes = (result.data.estimated_time_minutes as number) || 30;
    await db
      .update(courses)
      .set({
        curriculum: result.data,
        moduleCount: modules.length,
        estimatedMinutes,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));
    curriculum = result.data;
  } catch (error) {
    await db
      .update(courses)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Curriculum design failed",
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));
    throw error;
  }

  try {
    await updateProgress(courseId, "generating", "Generating interactive HTML course...", 75);
    const result = await runStage3(analysis, curriculum, course.targetAudience as TargetAudience);
    await updateProgress(courseId, "generating", result.progressDetail, 95);
    const slug = generateSlug(extraction.repoName, extraction.owner);
    const shareToken = crypto.randomBytes(16).toString("hex");
    await db
      .update(courses)
      .set({
        html: result.data,
        slug,
        shareToken,
        status: "completed",
        progress: { stage: "completed", detail: "Course generation complete!", percent: 100 },
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));
  } catch (error) {
    await db
      .update(courses)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "HTML generation failed",
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));
    throw error;
  }

  if (course.createdBy) {
    try {
      await registerWebhook(extraction.owner, extraction.repoName, courseId, course.createdBy);
    } catch (err) {
      console.warn("Auto-registration of webhook failed (non-fatal):", err);
    }
  }
}
