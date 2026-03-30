import { db } from "@workspace/db";
import { courses } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { extractRepo } from "../github";
import { runStage1, runStage2, runStage3 } from "../ai-pipeline";
import { ai } from "@workspace/integrations-gemini-ai";
import type { TargetAudience } from "../prompts";

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

async function generateChangeSummary(
  changedFiles: { added: string[]; modified: string[]; removed: string[] },
  commitMessages: string[],
  previousOneLiner: string | null,
  previousAnalysis?: string
): Promise<string> {
  const allFiles = [...changedFiles.added, ...changedFiles.modified, ...changedFiles.removed];

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
    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 200 },
    });
    return response.text?.trim() || `${allFiles.length} files changed`;
  } catch {
    return `${changedFiles.added.length} files added, ${changedFiles.modified.length} modified, ${changedFiles.removed.length} removed`;
  }
}

export async function regenerateCourseDirect(
  courseId: string,
  changedFiles: { added: string[]; modified: string[]; removed: string[] },
  commitMessages: string[]
): Promise<void> {
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
    course.analysis ? JSON.stringify(course.analysis, null, 2).slice(0, 2000) : undefined
  );

  const allFiles = [...changedFiles.added, ...changedFiles.modified, ...changedFiles.removed];
  await db
    .update(courses)
    .set({
      changesSince: {
        summary: changeSummary,
        changedFiles: allFiles,
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

  await updateProgress(courseId, "extracting", "Re-fetching repository contents from GitHub...", 5);

  let extraction;
  try {
    extraction = await extractRepo(course.githubUrl, course.createdBy ?? undefined);
    await updateProgress(courseId, "extracting", `Read ${extraction.files.length} files from ${extraction.owner}/${extraction.repoName}`, 15);
  } catch (error) {
    await db.update(courses).set({ status: "failed", errorMessage: error instanceof Error ? error.message : "Failed to extract repository", updatedAt: new Date() }).where(eq(courses.id, courseId));
    throw error;
  }

  const changedFileContents = extraction.files
    .filter((f: { path: string }) => changedFiles.added.includes(f.path) || changedFiles.modified.includes(f.path))
    .slice(0, 20)
    .map((f: { path: string; content: string }) => `--- ${f.path} ---\n${f.content.slice(0, 2000)}`)
    .join("\n\n");

  const previousAnalysisSummary = course.analysis ? JSON.stringify(course.analysis, null, 2).slice(0, 4000) : "N/A";

  const regenerationNote = `REGENERATION CONTEXT: This is a course regeneration triggered by repository changes.
Previous course description: "${course.oneLiner || "this codebase"}"
Previous version: ${course.version || 1}

Changes detected:
- Added files: ${changedFiles.added.join(", ") || "none"}
- Modified files: ${changedFiles.modified.join(", ") || "none"}
- Removed files: ${changedFiles.removed.join(", ") || "none"}

Change summary: ${changeSummary}

Recent commits: ${commitMessages.slice(0, 5).join("; ") || "N/A"}

PREVIOUS ANALYSIS (for context on what to update):
${previousAnalysisSummary}

CHANGED FILE CONTENTS (new/modified):
${changedFileContents || "No file contents available"}

INSTRUCTION: Update the course content to reflect these changes.`;

  let analysis;
  try {
    await updateProgress(courseId, "analyzing", "Re-analyzing codebase with changes...", 25);
    const result = await runStage1(extraction.fileTree, extraction.files, extraction.languageBreakdown, course.targetAudience as TargetAudience, regenerationNote);
    await updateProgress(courseId, "analyzing", result.progressDetail, 45);
    await db.update(courses).set({
      analysis: result.data,
      techStack: (result.data.tech_stack as Record<string, unknown>) ?? null,
      oneLiner: (result.data.one_liner as string) ?? null,
      difficulty: (result.data.difficulty_assessment as string) ?? null,
      updatedAt: new Date(),
    }).where(eq(courses.id, courseId));
    analysis = result.data;
  } catch (error) {
    await db.update(courses).set({ status: "failed", errorMessage: error instanceof Error ? error.message : "AI analysis failed", updatedAt: new Date() }).where(eq(courses.id, courseId));
    throw error;
  }

  let curriculum;
  try {
    await updateProgress(courseId, "designing", "Redesigning curriculum with changes...", 55);
    const result = await runStage2(analysis, course.targetAudience as TargetAudience, regenerationNote);
    await updateProgress(courseId, "designing", result.progressDetail, 70);
    const modules = (result.data.modules as unknown[]) || [];
    const estimatedMinutes = (result.data.estimated_time_minutes as number) || 30;
    await db.update(courses).set({ curriculum: result.data, moduleCount: modules.length, estimatedMinutes, updatedAt: new Date() }).where(eq(courses.id, courseId));
    curriculum = result.data;
  } catch (error) {
    await db.update(courses).set({ status: "failed", errorMessage: error instanceof Error ? error.message : "Curriculum design failed", updatedAt: new Date() }).where(eq(courses.id, courseId));
    throw error;
  }

  try {
    await updateProgress(courseId, "generating", "Regenerating interactive HTML course...", 75);
    const result = await runStage3(analysis, curriculum, course.targetAudience as TargetAudience, regenerationNote);
    await updateProgress(courseId, "generating", result.progressDetail, 95);
    await db.update(courses).set({
      html: result.data,
      status: "completed",
      version: (course.version || 1) + 1,
      progress: { stage: "completed", detail: "Course regeneration complete!", percent: 100 },
      updatedAt: new Date(),
    }).where(eq(courses.id, courseId));
  } catch (error) {
    await db.update(courses).set({ status: "failed", errorMessage: error instanceof Error ? error.message : "HTML generation failed", updatedAt: new Date() }).where(eq(courses.id, courseId));
    throw error;
  }
}
