import { db } from "@workspace/db";
import { courses, flashcards } from "@workspace/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateText } from "../llm";
import { extractRepo } from "../github";
import {
  runStage1Abstractions,
  runStage2Relationships,
  runStage3Order,
  runStage4WriteChapters,
  assembleV2Course,
  getOrCreateEmitter,
  removeEmitter,
} from "../pipeline";
import type { PipelineConfig, ChapterResult, Abstraction } from "../pipeline";
import { generateFlashcardsForChapters } from "../pipeline/stages";
import type { TargetAudience } from "../prompts";
import crypto from "crypto";

async function generateChangeSummary(
  changedFiles: { added: string[]; modified: string[]; removed: string[] },
  commitMessages: string[],
  previousOneLiner: string | null,
  previousAnalysis?: string,
): Promise<string> {
  const allFiles = [
    ...changedFiles.added,
    ...changedFiles.modified,
    ...changedFiles.removed,
  ];

  const prompt = `You are analyzing changes to a codebase. Provide a concise 1-3 sentence plain-English summary of what changed.

Previous course description: ${previousOneLiner || "N/A"}

Changed files:
- Added: ${changedFiles.added.join(", ") || "none"}
- Modified: ${changedFiles.modified.join(", ") || "none"}
- Removed: ${changedFiles.removed.join(", ") || "none"}

Recent commit messages:
${commitMessages.slice(0, 10).map((m) => `- ${m}`).join("\n")}
${previousAnalysis ? `\nPrevious analysis context:\n${previousAnalysis.slice(0, 2000)}` : ""}

Respond with ONLY the plain-English summary, no markdown or bullet points.`;

  try {
    const response = await generateText({
      task: "summary",
      prompt,
      maxOutputTokens: 200,
    });
    return response.text?.trim() || `${allFiles.length} files changed`;
  } catch {
    return `${changedFiles.added.length} files added, ${changedFiles.modified.length} modified, ${changedFiles.removed.length} removed`;
  }
}


function diffFileHashes(
  oldHashes: Record<string, string>,
  newHashes: Record<string, string>,
): { added: string[]; modified: string[]; removed: string[] } {
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const path of Object.keys(newHashes)) {
    if (!(path in oldHashes)) {
      added.push(path);
    } else if (oldHashes[path] !== newHashes[path]) {
      modified.push(path);
    }
  }

  for (const path of Object.keys(oldHashes)) {
    if (!(path in newHashes)) {
      removed.push(path);
    }
  }

  return { added, modified, removed };
}

function findAffectedChapterIndices(
  changedPaths: string[],
  abstractions: Abstraction[],
  orderedChapters: Array<{ index: number; abstractionRef?: string }>,
): Set<number> {
  const affectedIndices = new Set<number>();
  const changedSet = new Set(changedPaths);

  const affectedAbstractionNames = new Set<string>();
  for (const abstraction of abstractions) {
    const abstractionFiles = abstraction.file_paths || [];

    if (abstractionFiles.some(p => changedSet.has(p))) {
      affectedAbstractionNames.add(abstraction.name);
    }
  }

  for (const chapter of orderedChapters) {
    if (chapter.abstractionRef && affectedAbstractionNames.has(chapter.abstractionRef)) {
      affectedIndices.add(chapter.index);
    }
  }

  affectedIndices.add(0);
  affectedIndices.add(1);

  return affectedIndices;
}

export async function regenerateCourseDirect(
  courseId: string,
  changedFiles: { added: string[]; modified: string[]; removed: string[] },
  commitMessages: string[],
): Promise<void> {
  const emitter = getOrCreateEmitter(courseId);

  try {
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) throw new Error(`Course ${courseId} not found`);

    const changeSummary = await generateChangeSummary(
      changedFiles,
      commitMessages,
      course.oneLiner,
      course.analysis ? JSON.stringify(course.analysis, null, 2).slice(0, 2000) : undefined,
    );

    const allChanged = [
      ...changedFiles.added,
      ...changedFiles.modified,
      ...changedFiles.removed,
    ];

    await db
      .update(courses)
      .set({
        changesSince: {
          summary: changeSummary,
          changedFiles: allChanged,
          addedFiles: changedFiles.added,
          modifiedFiles: changedFiles.modified,
          removedFiles: changedFiles.removed,
          previousVersionId: course.id,
          detectedAt: new Date().toISOString(),
        },
        status: "generating",
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));

    const oldHashes = (course.sourceFileHashes as Record<string, string>) || {};
    const existingState = course.pipelineState as {
      stage?: string;
      abstractions?: Abstraction[];
      relationships?: unknown[];
      curriculum?: unknown[];
      chaptersProgress?: ChapterResult[];
    } | null;

    const audience = (course.targetAudience || "new_engineer") as TargetAudience;
    const depth = (course.depthPreset || "full") as "quick" | "full" | "deep";
    const focusAreas = (course.focusAreas || []) as string[];
    const customContext = changeSummary;

    emitter.emitStageStart("extraction", "Re-fetching repository...", 0, 5);
    const extraction = await extractRepo(course.githubUrl, course.createdBy ?? undefined);
    emitter.emitStageComplete("extraction", `Fetched ${extraction.filesIncludedFull} files`, 1, 5);

    const newHashes = extraction.sourceFileHashes;
    const fileDiff = diffFileHashes(oldHashes, newHashes);
    const changedPaths = [...fileDiff.added, ...fileDiff.modified, ...fileDiff.removed];

    const hasStructuralChanges = changedPaths.length > Object.keys(newHashes).length * 0.3;
    const pipelineConfig: PipelineConfig = { audience, depth, focusAreas, customContext };

    if (hasStructuralChanges || !existingState?.abstractions || !existingState?.relationships || !existingState?.curriculum) {
      console.log(`[Regenerate] ${changedPaths.length} files changed (${hasStructuralChanges ? "structural" : "no prior state"}), running full pipeline`);

      await db.update(courses).set({ pipelineState: null, updatedAt: new Date() }).where(eq(courses.id, courseId));

      const abstractions = await runStage1Abstractions(extraction, pipelineConfig, emitter);
      await db.update(courses).set({
        pipelineState: { stage: "abstractions", abstractions },
        analysis: { abstractions: abstractions.map(a => ({ name: a.name, description: a.description })) },
        sourceFileHashes: newHashes,
        updatedAt: new Date(),
      }).where(eq(courses.id, courseId));

      const relationships = await runStage2Relationships(abstractions, extraction, pipelineConfig, emitter);
      await db.update(courses).set({
        pipelineState: { stage: "relationships", abstractions, relationships },
        updatedAt: new Date(),
      }).where(eq(courses.id, courseId));

      const orderedChapters = await runStage3Order(abstractions, relationships, pipelineConfig, emitter);
      await db.update(courses).set({
        pipelineState: { stage: "curriculum", abstractions, relationships, curriculum: orderedChapters },
        curriculum: { chapters: orderedChapters },
        moduleCount: orderedChapters.length,
        updatedAt: new Date(),
      }).where(eq(courses.id, courseId));

      const chapters = await runStage4WriteChapters(
        orderedChapters, abstractions, relationships, extraction, pipelineConfig, emitter,
      );

      const html = assembleV2Course(chapters, extraction, relationships, abstractions, pipelineConfig);
      const shareToken = crypto.randomBytes(16).toString("hex");

      await db.update(courses).set({
        html,
        shareToken,
        status: "completed",
        version: (course.version || 1) + 1,
        pipelineState: { stage: "chapters_complete", abstractions, relationships, curriculum: orderedChapters, chaptersProgress: chapters },
        sourceFileHashes: newHashes,
        progress: { stage: "completed", detail: "Course regenerated!", percent: 100 },
        updatedAt: new Date(),
      }).where(eq(courses.id, courseId));

      emitter.emitCompleted("Course regenerated!");

      const regen_audience = pipelineConfig.audience;
      db.delete(flashcards).where(eq(flashcards.courseId, courseId))
        .then(() => generateFlashcardsForChapters(chapters, courseId, regen_audience))
        .then(async (cards) => {
          if (cards.length > 0) {
            await db.insert(flashcards).values(
              cards.map((c) => ({ courseId, moduleIndex: c.moduleIndex, front: c.front, back: c.back, codeSnippet: c.codeSnippet || null }))
            ).onConflictDoNothing();
          }
        })
        .catch((err) => console.warn("[Regenerate] Flashcard regeneration failed (non-fatal):", err));
    } else {
      console.log(`[Regenerate] ${changedPaths.length} files changed, attempting selective chapter regeneration`);

      const abstractions = existingState.abstractions;
      const relationships = existingState.relationships as Awaited<ReturnType<typeof runStage2Relationships>>;
      const orderedChapters = existingState.curriculum as Awaited<ReturnType<typeof runStage3Order>>;
      const previousChapters = existingState.chaptersProgress || [];

      const affectedIndices = findAffectedChapterIndices(changedPaths, abstractions, orderedChapters);
      console.log(`[Regenerate] Affected chapters: ${Array.from(affectedIndices).join(", ")}`);

      const unaffectedChapters = (previousChapters as ChapterResult[]).filter(
        ch => !affectedIndices.has(ch.index)
      );
      const chaptersToRewrite = orderedChapters.filter(ch => affectedIndices.has(ch.index));

      emitter.emitStageStart("write_chapters", `Rewriting ${chaptersToRewrite.length} affected chapters...`, 3, 5);

      const rewrittenChapters = await runStage4WriteChapters(
        chaptersToRewrite, abstractions, relationships, extraction, pipelineConfig, emitter,
      );

      for (const ch of rewrittenChapters) {
        ch.regenerated = true;
      }

      const allChapters = [...unaffectedChapters, ...rewrittenChapters].sort((a, b) => a.index - b.index);
      const html = assembleV2Course(allChapters, extraction, relationships, abstractions, pipelineConfig);
      const shareToken = crypto.randomBytes(16).toString("hex");

      await db.update(courses).set({
        html,
        shareToken,
        status: "completed",
        version: (course.version || 1) + 1,
        pipelineState: { stage: "chapters_complete", abstractions, relationships, curriculum: orderedChapters, chaptersProgress: allChapters },
        sourceFileHashes: newHashes,
        progress: { stage: "completed", detail: `Regenerated ${chaptersToRewrite.length} affected chapters!`, percent: 100 },
        updatedAt: new Date(),
      }).where(eq(courses.id, courseId));

      emitter.emitCompleted(`Regenerated ${chaptersToRewrite.length} affected chapters!`);

      const selective_audience = pipelineConfig.audience;
      const affectedModuleIndices = rewrittenChapters.map((c) => c.index);
      db.delete(flashcards)
        .where(and(eq(flashcards.courseId, courseId), inArray(flashcards.moduleIndex, affectedModuleIndices)))
        .then(() => generateFlashcardsForChapters(rewrittenChapters, courseId, selective_audience))
        .then(async (cards) => {
          if (cards.length > 0) {
            await db.insert(flashcards).values(
              cards.map((c) => ({ courseId, moduleIndex: c.moduleIndex, front: c.front, back: c.back, codeSnippet: c.codeSnippet || null }))
            ).onConflictDoNothing();
          }
        })
        .catch((err) => console.warn("[Regenerate] Selective flashcard update failed (non-fatal):", err));
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Regeneration failed";
    await db.update(courses).set({ status: "failed", errorMessage: msg, updatedAt: new Date() }).where(eq(courses.id, courseId));
    emitter.emitFailed("regeneration", msg);
    throw error;
  } finally {
    setTimeout(() => removeEmitter(courseId), 5000);
  }
}
