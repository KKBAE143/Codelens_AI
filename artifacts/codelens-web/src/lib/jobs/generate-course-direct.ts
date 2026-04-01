import { db } from "@workspace/db";
import { courses, generationCache, users, flashcards } from "@workspace/db/schema";
import { eq, and, gt, desc } from "drizzle-orm";
import { extractRepo } from "../github";
import { registerWebhook } from "../github-webhooks";
import { sendCourseGeneratedEmail, isEmailConfigured } from "../email";
import type { TargetAudience } from "../prompts";
import {
  runStage1Abstractions,
  runStage2Relationships,
  runStage3Order,
  runStage4WriteChapters,
  assembleV2Course,
  getOrCreateEmitter,
  removeEmitter,
} from "../pipeline";
import type { PipelineConfig, ChapterResult } from "../pipeline";
import { generateFlashcardsForChapters } from "../pipeline/stages";
import crypto from "crypto";

function generateSlug(repoName: string, owner: string): string {
  const base = `${owner}-${repoName}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

function computeConfigHash(
  repoUrl: string,
  persona: string,
  depth: string,
  focusAreas: string[],
  customContext: string,
): string {
  const payload = JSON.stringify({
    repoUrl,
    persona,
    depth,
    focusAreas: [...focusAreas].sort(),
    customContext,
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function updateProgress(
  courseId: string,
  stage: string,
  detail: string,
  percent: number,
) {
  await db
    .update(courses)
    .set({
      progress: { stage, detail, percent },
      updatedAt: new Date(),
    })
    .where(eq(courses.id, courseId));
}

async function checkGenerationCache(
  repoUrl: string,
  configHash: string,
  userId: string,
): Promise<string | null> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [cached] = await db
    .select({ courseId: generationCache.courseId })
    .from(generationCache)
    .where(
      and(
        eq(generationCache.repoUrl, repoUrl),
        eq(generationCache.configHash, configHash),
        eq(generationCache.createdBy, userId),
        gt(generationCache.createdAt, sevenDaysAgo),
      )
    )
    .orderBy(desc(generationCache.createdAt))
    .limit(1);

  if (cached) {
    const [existingCourse] = await db
      .select({ status: courses.status })
      .from(courses)
      .where(eq(courses.id, cached.courseId))
      .limit(1);

    if (existingCourse?.status === "completed") {
      return cached.courseId;
    }
  }

  return null;
}

async function saveToCache(repoUrl: string, configHash: string, courseId: string, userId: string) {
  await db.insert(generationCache).values({
    repoUrl,
    configHash,
    courseId,
    createdBy: userId,
  });
}

export async function generateCourseDirect(courseId: string): Promise<void> {
  const emitter = getOrCreateEmitter(courseId);

  try {
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) throw new Error(`Course ${courseId} not found`);

    const audience = (course.targetAudience || "new_engineer") as TargetAudience;
    const depth = (course.depthPreset || "full") as "quick" | "full" | "deep";
    const focusAreas = (course.focusAreas || []) as string[];
    const customContext = course.customContext || "";

    const configHash = computeConfigHash(
      course.githubUrl,
      audience,
      depth,
      focusAreas,
      customContext,
    );

    const userId = course.createdBy ?? "";
    const cachedCourseId = userId ? await checkGenerationCache(course.githubUrl, configHash, userId) : null;
    if (cachedCourseId && cachedCourseId !== courseId) {
      const [cachedCourse] = await db
        .select({ html: courses.html, analysis: courses.analysis, curriculum: courses.curriculum })
        .from(courses)
        .where(eq(courses.id, cachedCourseId))
        .limit(1);

      if (cachedCourse?.html) {
        const slug = generateSlug(course.repoName, course.ownerName);
        const shareToken = crypto.randomBytes(16).toString("hex");
        await db
          .update(courses)
          .set({
            html: cachedCourse.html,
            analysis: cachedCourse.analysis,
            curriculum: cachedCourse.curriculum,
            slug,
            shareToken,
            configHash,
            status: "completed",
            progress: { stage: "completed", detail: "Course loaded from cache!", percent: 100 },
            updatedAt: new Date(),
          })
          .where(eq(courses.id, courseId));

        emitter.emitCompleted("Course loaded from cache!");
        removeEmitter(courseId);
        return;
      }
    }

    await db
      .update(courses)
      .set({
        status: "generating",
        configHash,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));

    await updateProgress(courseId, "extracting", "Fetching repository contents from GitHub...", 5);
    emitter.emitStageStart("extraction", "Fetching repository...", 0, 5);

    let extraction;
    try {
      extraction = await extractRepo(course.githubUrl, course.createdBy ?? undefined);
      await updateProgress(
        courseId,
        "extracting",
        `Read ${extraction.filesIncludedFull} files from ${extraction.owner}/${extraction.repoName} (${extraction.totalFilesCatalogued} total, ${extraction.packedTokenCount} tokens)`,
        12,
      );
      emitter.emitStageComplete("extraction", `Fetched ${extraction.filesIncludedFull} files`, 1, 5);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to extract repository";
      await db.update(courses).set({ status: "failed", errorMessage: msg, updatedAt: new Date() }).where(eq(courses.id, courseId));
      emitter.emitFailed("extraction", msg);
      removeEmitter(courseId);
      throw error;
    }

    const pipelineConfig: PipelineConfig = { audience, depth, focusAreas, customContext };

    const existingState = course.pipelineState as {
      stage?: string;
      abstractions?: unknown;
      relationships?: unknown;
      curriculum?: unknown;
      chaptersProgress?: unknown[];
      completedChapterIndices?: number[];
    } | null;

    let abstractions;
    try {
      if (existingState?.abstractions && Array.isArray(existingState.abstractions)) {
        abstractions = existingState.abstractions as Awaited<ReturnType<typeof runStage1Abstractions>>;
        console.log(`[Pipeline] Resuming from cached Stage 1 (${abstractions.length} abstractions)`);
      } else {
        await updateProgress(courseId, "analyzing", "Identifying core abstractions...", 20);
        abstractions = await runStage1Abstractions(extraction, pipelineConfig, emitter);
        await db.update(courses).set({
          pipelineState: { stage: "abstractions", abstractions },
          analysis: { abstractions: abstractions.map(a => ({ name: a.name, description: a.description })) },
          sourceFileHashes: extraction.sourceFileHashes,
          updatedAt: new Date(),
        }).where(eq(courses.id, courseId));
      }
      await updateProgress(courseId, "analyzing", `Identified ${abstractions.length} abstractions: ${abstractions.map(a => a.name).join(", ")}`, 30);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Abstraction identification failed";
      await db.update(courses).set({ status: "failed", errorMessage: msg, updatedAt: new Date() }).where(eq(courses.id, courseId));
      emitter.emitFailed("identify_abstractions", msg);
      removeEmitter(courseId);
      throw error;
    }

    let relationships;
    try {
      if (existingState?.relationships && Array.isArray(existingState.relationships)) {
        relationships = existingState.relationships as Awaited<ReturnType<typeof runStage2Relationships>>;
        console.log(`[Pipeline] Resuming from cached Stage 2 (${relationships.length} relationships)`);
      } else {
        await updateProgress(courseId, "analyzing", "Analyzing relationships between abstractions...", 38);
        relationships = await runStage2Relationships(abstractions, extraction, pipelineConfig, emitter);
        await db.update(courses).set({
          pipelineState: { stage: "relationships", abstractions, relationships },
          updatedAt: new Date(),
        }).where(eq(courses.id, courseId));
      }
      await updateProgress(courseId, "analyzing", `Found ${relationships.length} relationships`, 42);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Relationship analysis failed";
      await db.update(courses).set({ status: "failed", errorMessage: msg, updatedAt: new Date() }).where(eq(courses.id, courseId));
      emitter.emitFailed("analyze_relationships", msg);
      removeEmitter(courseId);
      throw error;
    }

    let orderedChapters;
    try {
      await updateProgress(courseId, "designing", "Determining optimal learning order...", 48);
      orderedChapters = await runStage3Order(abstractions, relationships, pipelineConfig, emitter);
      await db.update(courses).set({
        pipelineState: { stage: "curriculum", abstractions, relationships, curriculum: orderedChapters },
        curriculum: { chapters: orderedChapters },
        moduleCount: orderedChapters.length,
        updatedAt: new Date(),
      }).where(eq(courses.id, courseId));
      await updateProgress(courseId, "designing", `Ordered ${orderedChapters.length} chapters`, 55);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Chapter ordering failed";
      await db.update(courses).set({ status: "failed", errorMessage: msg, updatedAt: new Date() }).where(eq(courses.id, courseId));
      emitter.emitFailed("order_chapters", msg);
      removeEmitter(courseId);
      throw error;
    }

    let chapters: ChapterResult[];
    try {
      await updateProgress(courseId, "generating", `Writing ${orderedChapters.length} chapters...`, 60);

      const existingChapters = existingState?.chaptersProgress as ChapterResult[] | undefined;

      const chapterCheckpoint = async (completedChapters: ChapterResult[]) => {
        await db.update(courses).set({
          pipelineState: {
            stage: "writing_chapters",
            abstractions,
            relationships,
            curriculum: orderedChapters,
            chaptersProgress: completedChapters,
            completedChapterIndices: completedChapters.map(c => c.index),
          },
          updatedAt: new Date(),
        }).where(eq(courses.id, courseId));
      };

      chapters = await runStage4WriteChapters(
        orderedChapters,
        abstractions,
        relationships,
        extraction,
        pipelineConfig,
        emitter,
        existingChapters,
        chapterCheckpoint,
      );

      await db.update(courses).set({
        pipelineState: {
          stage: "chapters_complete",
          abstractions,
          relationships,
          curriculum: orderedChapters,
          chaptersProgress: chapters,
          completedChapterIndices: chapters.map(c => c.index),
        },
        updatedAt: new Date(),
      }).where(eq(courses.id, courseId));

      await updateProgress(courseId, "generating", `Wrote ${chapters.length} chapters`, 88);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Chapter writing failed";
      await db.update(courses).set({ status: "failed", errorMessage: msg, updatedAt: new Date() }).where(eq(courses.id, courseId));
      emitter.emitFailed("write_chapters", msg);
      removeEmitter(courseId);
      throw error;
    }

    await updateProgress(courseId, "polishing", "Assembling final course structure...", 92);
    emitter.emitStageStart("polishing", "Assembling final course...", 4, 5);

    const html = assembleV2Course(chapters, extraction, relationships, abstractions, pipelineConfig);

    await updateProgress(courseId, "polishing", "Finalizing and saving course...", 96);
    emitter.emitStageComplete("polishing", "Course assembled", 4, 5);
    const slug = generateSlug(extraction.repoName, extraction.owner);
    const shareToken = crypto.randomBytes(16).toString("hex");
    const totalMinutes = chapters.reduce((sum, c) => sum + (c.estimatedMinutes || 8), 0);

    await db.update(courses).set({
      html,
      slug,
      shareToken,
      status: "completed",
      estimatedMinutes: totalMinutes,
      progress: { stage: "completed", detail: "Course generation complete!", percent: 100 },
      updatedAt: new Date(),
    }).where(eq(courses.id, courseId));

    if (userId) {
      await saveToCache(course.githubUrl, configHash, courseId, userId);
    }

    emitter.emitCompleted("Course generation complete!");

    generateFlashcardsForChapters(chapters, courseId, pipelineConfig.audience)
      .then(async (cards) => {
        if (cards.length > 0) {
          await db.insert(flashcards).values(
            cards.map((c) => ({
              courseId,
              moduleIndex: c.moduleIndex,
              front: c.front,
              back: c.back,
              codeSnippet: c.codeSnippet || null,
            }))
          ).onConflictDoNothing();
          console.log(`[Pipeline] Stored ${cards.length} flashcards for course ${courseId}`);
        }
      })
      .catch((err) => {
        console.warn("[Pipeline] Flashcard generation failed (non-fatal):", err);
      });

    if (course.createdBy) {
      try {
        await registerWebhook(extraction.owner, extraction.repoName, courseId, course.createdBy);
      } catch (err) {
        console.warn("Auto-registration of webhook failed (non-fatal):", err);
      }

      if (isEmailConfigured()) {
        try {
          const [userRecord] = await db
            .select({ email: users.email, displayName: users.displayName, emailNotifications: users.emailNotifications })
            .from(users)
            .where(eq(users.id, course.createdBy))
            .limit(1);

          if (userRecord?.email && userRecord.emailNotifications) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://codelens.ai";
            const courseName = `${extraction.owner}/${extraction.repoName}`;
            await sendCourseGeneratedEmail(
              userRecord.email,
              userRecord.displayName,
              courseName,
              `${appUrl}/course/${courseId}`,
            );
          }
        } catch (emailErr) {
          console.warn("Email notification failed (non-fatal):", emailErr);
        }
      }
    }
  } catch (error) {
    removeEmitter(courseId);
    throw error;
  } finally {
    setTimeout(() => removeEmitter(courseId), 5000);
  }
}
