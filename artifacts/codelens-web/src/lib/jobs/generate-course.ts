import { inngest } from "../inngest";
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

export const generateCourseJob = inngest.createFunction(
  {
    id: "generate-course",
    retries: 3,
  },
  { event: "codelens/course.generate" },
  async ({ event, step }) => {
    const { courseId } = event.data;

    const course = await step.run("fetch-course", async () => {
      const [c] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);

      if (!c) throw new Error(`Course ${courseId} not found`);
      return c;
    });

    await step.run("mark-generating", async () => {
      await db
        .update(courses)
        .set({
          status: "generating",
          generationJobId: event.id,
          updatedAt: new Date(),
        })
        .where(eq(courses.id, courseId));

      await updateProgress(courseId, "extracting", "Fetching repository contents from GitHub...", 5);
    });

    const extraction = await step.run("extract-repo", async () => {
      try {
        const result = await extractRepo(course.githubUrl, course.createdBy ?? undefined);

        await updateProgress(
          courseId,
          "extracting",
          `Read ${result.files.length} files from ${result.owner}/${result.repoName} (${result.fileTree.length} total files, ${Object.entries(result.languageBreakdown).map(([l, c]) => `${l}: ${c}`).join(", ")})`,
          15
        );

        return result;
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
    });

    const analysis = await step.run("stage1-analysis", async () => {
      await updateProgress(
        courseId,
        "analyzing",
        `Analyzing codebase architecture and patterns (${extraction.files.length} files, ${extraction.estimatedComplexity} complexity)...`,
        25
      );

      try {
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

        return result.data;
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
    });

    const curriculum = await step.run("stage2-curriculum", async () => {
      await updateProgress(
        courseId,
        "designing",
        "Designing interactive curriculum with quizzes, code translations, and visualizations...",
        55
      );

      try {
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

        return result.data;
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
    });

    await step.run("stage3-html", async () => {
      await updateProgress(
        courseId,
        "generating",
        "Generating interactive HTML course with animations, quizzes, and glossary tooltips...",
        75
      );

      try {
        const result = await runStage3(
          analysis,
          curriculum,
          course.targetAudience as TargetAudience
        );

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
    });

    await step.run("auto-register-webhook", async () => {
      if (!course.createdBy) return;
      try {
        await registerWebhook(
          extraction.owner,
          extraction.repoName,
          courseId,
          course.createdBy
        );
      } catch (err) {
        console.warn("Auto-registration of webhook failed (non-fatal):", err);
      }
    });

    return { success: true, courseId };
  }
);
