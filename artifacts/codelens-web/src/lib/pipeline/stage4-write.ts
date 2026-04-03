import { generateText } from "../llm";
import { countTokens, truncateAtFunctionBoundary, getDepthTokenBudget, getDepthContextBudget } from "../token-counter";
import { v2ChapterSchema } from "../v2-schema";
import type { RepoExtraction } from "../github";
import type { PipelineEmitter } from "./events";
import {
  getChapterWritePrompt,
  getSetupChapterPrompt,
  getDependenciesChapterPrompt,
  getTroubleshootingChapterPrompt,
  getOverviewChapterPrompt,
} from "./prompts";
import { computePageRank } from "../repo-map";
import { safeParseJson } from "../utils/safe-json-parse";
import { normalizeBlock, buildFallbackBlocks } from "./helpers";
import type { Abstraction, Relationship, OrderedChapter, ChapterResult, PipelineConfig } from "./types";

function getAbstractionFilesByPageRank(
  abstraction: Abstraction,
  extraction: RepoExtraction,
): Array<{ path: string; content: string; size: number }> {
  const files = abstraction.file_indices
    .filter((idx) => idx < extraction.files.length)
    .map((idx) => extraction.files[idx]);

  if (files.length <= 1) return files;

  const pageRank = computePageRank(files);

  return [...files].sort((a, b) => {
    const scoreA = pageRank.scores.get(a.path) || 0;
    const scoreB = pageRank.scores.get(b.path) || 0;
    const degreeA = pageRank.inDegree.get(a.path) || 0;
    const degreeB = pageRank.inDegree.get(b.path) || 0;
    return (scoreB * 1000 + degreeB) - (scoreA * 1000 + degreeA);
  });
}

function buildCrossAbstractionContext(
  currentAbstraction: string,
  abstractions: Abstraction[],
  relationships: Relationship[],
): string {
  const related = relationships.filter(
    (r) => r.from === currentAbstraction || r.to === currentAbstraction,
  );

  if (related.length === 0) return "";

  const relatedNames = new Set<string>();
  for (const r of related) {
    if (r.from !== currentAbstraction) relatedNames.add(r.from);
    if (r.to !== currentAbstraction) relatedNames.add(r.to);
  }

  const summaries = abstractions
    .filter((a) => relatedNames.has(a.name))
    .map((a) => `**${a.name}**: ${a.description.slice(0, 200)}`)
    .slice(0, 5);

  if (summaries.length === 0) return "";

  return `\n\nRelated abstractions the reader already knows about:\n${summaries.join("\n")}`;
}

function packAbstractionContext(
  files: Array<{ path: string; content: string; size: number }>,
  contextBudget: number,
): string {
  const fileTree = files.map((f) => {
    const lines = f.content.split("\n").length;
    return `  ${f.path} (${lines} lines)`;
  }).join("\n");
  const treeSummary = `=== File Tree (${files.length} files, ordered by importance) ===\n${fileTree}\n`;
  const treeSummaryTokens = countTokens(treeSummary);

  const parts: string[] = [treeSummary];
  let tokensSoFar = treeSummaryTokens;

  for (const f of files) {
    const header = `\n=== File: ${f.path} ===\n`;
    const headerTokens = countTokens(header);

    const remaining = contextBudget - tokensSoFar - headerTokens;
    if (remaining <= 100) break;

    const truncated = truncateAtFunctionBoundary(f.content, remaining);
    const blockTokens = countTokens(truncated);

    parts.push(`${header}${truncated}`);
    tokensSoFar += headerTokens + blockTokens;
  }

  return parts.join("\n");
}

function getProgressiveBlockRequirements(attempt: number, depth: "quick" | "full" | "deep"): string {
  if (attempt === 1) return "";

  if (attempt === 2) {
    return `\n\nSIMPLIFIED REQUIREMENTS (retry — use fewer block types for reliability):
- Reduce block count: aim for ${depth === "quick" ? "4-6" : depth === "full" ? "6-8" : "8-12"} blocks
- Mermaid diagram is OPTIONAL — skip if complex
- Quiz can have 2 options instead of 3-4
- Code blocks: include 1-2 key excerpts instead of 2-4
- Prioritize text explanations and code examples over diagrams`;
  }

  return `\n\nMINIMAL REQUIREMENTS (attempt ${attempt}):
- Write 3-5 blocks only
- 1 text block explaining the abstraction
- 1 code block with the most important function
- 1 callout with a key insight
- Skip mermaid, quiz, file-list if they cause issues`;
}

async function writeOneChapter(
  chapter: OrderedChapter,
  abstractions: Abstraction[],
  relationships: Relationship[],
  extraction: RepoExtraction,
  config: PipelineConfig,
  emitter: PipelineEmitter,
  totalChapters: number,
): Promise<ChapterResult> {
  emitter.emitChapterStart(chapter.index, chapter.title, totalChapters);

  const outputTokenBudget = getDepthTokenBudget(config.depth);
  const contextBudget = getDepthContextBudget(config.depth);

  let prompt: string;
  let contextData: string;

  if (chapter.chapterType === "overview") {
    prompt = getOverviewChapterPrompt(config.audience);
    const relGraph = relationships
      .map((r) => `${r.from} -> ${r.to} (${r.relation})`)
      .join("\n");
    contextData = `Repository: ${extraction.repoName}\nOwner: ${extraction.owner}\nFiles: ${extraction.totalFilesCatalogued}\nLanguages: ${Object.entries(
      extraction.languageBreakdown,
    )
      .map(([l, c]) => `${l}: ${c}`)
      .join(
        ", ",
      )}\n\nAbstractions:\n${abstractions.map((a) => `- ${a.name}: ${a.description}`).join("\n")}\n\nRelationship graph:\n${relGraph}\n\nFile tree (first 100):\n${extraction.fileTree.slice(0, 100).join("\n")}`;
  } else if (chapter.chapterType === "setup") {
    prompt = getSetupChapterPrompt(config.audience);
    const pkgData = extraction.parsedPackageJson
      ? `Package.json:\nDependencies: ${extraction.parsedPackageJson.dependencies.map((d) => `${d.name}@${d.version}`).join(", ")}\nScripts: ${JSON.stringify(extraction.parsedPackageJson.scripts)}`
      : "No package.json found";
    const envData = extraction.parsedEnvExample
      ? `Environment variables:\n${extraction.parsedEnvExample.map((v) => `${v.key}=${v.value} ${v.comment ? `# ${v.comment}` : ""}`).join("\n")}`
      : "No .env.example found";
    const dockerData = extraction.parsedDockerfile
      ? `Dockerfile:\nBase: ${extraction.parsedDockerfile.baseImage}\nPorts: ${extraction.parsedDockerfile.exposePorts.join(", ")}\nCommands: ${extraction.parsedDockerfile.keyCommands.join("; ")}`
      : "No Dockerfile found";
    contextData = `${pkgData}\n\n${envData}\n\n${dockerData}`;
  } else if (chapter.chapterType === "dependencies") {
    prompt = getDependenciesChapterPrompt(config.audience);
    contextData = extraction.parsedPackageJson
      ? `Dependencies:\n${extraction.parsedPackageJson.dependencies.map((d) => `- ${d.name}@${d.version}`).join("\n")}\n\nDev Dependencies:\n${extraction.parsedPackageJson.devDependencies.map((d) => `- ${d.name}@${d.version}`).join("\n")}`
      : "No package.json data available";
  } else if (chapter.chapterType === "troubleshooting") {
    prompt = getTroubleshootingChapterPrompt(config.audience);
    contextData = `Repository: ${extraction.repoName}\nKey files:\n${extraction.files
      .slice(0, 20)
      .map((f) => f.path)
      .join(
        "\n",
      )}\n\nAbstractions:\n${abstractions.map((a) => `- ${a.name}: ${a.description}`).join("\n")}`;
  } else { /* abstraction chapter */
    const abstraction = abstractions.find(
      (a) => a.name === chapter.abstractionRef,
    );
    const relContext = relationships
      .filter(
        (r) =>
          r.from === chapter.abstractionRef || r.to === chapter.abstractionRef,
      )
      .map((r) => `${r.from} --[${r.relation}]--> ${r.to}: ${r.description}`)
      .join("\n");

    const crossContext = buildCrossAbstractionContext(
      chapter.abstractionRef || chapter.title,
      abstractions,
      relationships,
    );

    prompt = getChapterWritePrompt(
      config.audience,
      config.depth,
      chapter.abstractionRef || chapter.title,
      abstraction?.description || "",
      relContext + crossContext,
      config.customContext,
    );

    if (abstraction) {
      const rankedFiles = getAbstractionFilesByPageRank(abstraction, extraction);
      contextData = packAbstractionContext(rankedFiles, contextBudget);
    } else {
      contextData = `No specific files assigned to this abstraction.`;
    }
  }

  let blocks: unknown[] = [];
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const isAbstractionChapter = !chapter.chapterType || chapter.chapterType === "abstraction";
      const progressiveHint = isAbstractionChapter ? getProgressiveBlockRequirements(attempt, config.depth) : "";
      const fullPrompt = `${prompt}${progressiveHint}\n\n${contextData}`;

      const response = await generateText({
        task: "stage3",
        prompt: lastError
          ? `${fullPrompt}\n\nPrevious attempt failed validation with this error:\n${lastError}\n\nFix the schema issues and return JSON only.`
          : fullPrompt,
        responseMimeType: "application/json",
        maxOutputTokens: outputTokenBudget,
      });

      const parsed = safeParseJson(response.text) as Record<string, unknown>;
      const rawBlocks = Array.isArray(parsed.blocks)
        ? parsed.blocks
        : Array.isArray(parsed)
          ? parsed
          : [];

      if (rawBlocks.length === 0) {
        throw new Error("No blocks generated");
      }

      const validationErrors: string[] = [];
      blocks = rawBlocks
        .map((block: unknown, index: number) => {
          const normalized = normalizeBlock(block);
          const parsedBlock =
            v2ChapterSchema.shape.blocks.element.safeParse(normalized);
          if (!parsedBlock.success) {
            validationErrors.push(
              `block ${index}: ${parsedBlock.error.issues.map((issue) => issue.message).join(", ")}`,
            );
            return null;
          }
          return parsedBlock.data;
        })
        .filter(Boolean);

      if (blocks.length > 0) break;
      throw new Error(
        validationErrors.join(" | ") || "All blocks failed validation",
      );
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 3) {
        blocks = buildFallbackBlocks(
          chapter,
          abstractions,
          relationships,
          extraction,
        );
      }
    }
  }

  return {
    index: chapter.index,
    title: chapter.title,
    learningObjective: chapter.learningObjective,
    estimatedMinutes: chapter.estimatedMinutes,
    focusAreas: chapter.focusAreas,
    abstractionRef: chapter.abstractionRef,
    blocks,
  };
}

export async function runStage4WriteChapters(
  chapters: OrderedChapter[],
  abstractions: Abstraction[],
  relationships: Relationship[],
  extraction: RepoExtraction,
  config: PipelineConfig,
  emitter: PipelineEmitter,
  existingChapters?: ChapterResult[],
  onChapterCheckpoint?: (completedChapters: ChapterResult[]) => Promise<void>,
): Promise<ChapterResult[]> {
  emitter.emitStageStart(
    "write_chapters",
    `Writing ${chapters.length} chapters...`,
    3,
    5,
  );

  const completedMap = new Map<number, ChapterResult>();
  if (existingChapters) {
    for (const ch of existingChapters) {
      completedMap.set(ch.index, ch);
    }
  }

  const chaptersToWrite = chapters.filter((c) => !completedMap.has(c.index));
  const concurrency = 6;
  const results: ChapterResult[] = [...completedMap.values()];

  for (let i = 0; i < chaptersToWrite.length; i += concurrency) {
    const batch = chaptersToWrite.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map((chapter) =>
        writeOneChapter(
          chapter,
          abstractions,
          relationships,
          extraction,
          config,
          emitter,
          chapters.length,
        ),
      ),
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const chapter = batch[j];
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
        emitter.emitChapterComplete(
          chapter.index,
          chapter.title,
          chapters.length,
        );
      } else {
        const error =
          result.status === "rejected" ? result.reason : "Unknown error";
        emitter.emitChapterFailed(
          chapter.index,
          chapter.title,
          chapters.length,
          String(error),
        );
        results.push({
          index: chapter.index,
          title: chapter.title,
          learningObjective: chapter.learningObjective,
          estimatedMinutes: chapter.estimatedMinutes,
          blocks: [
            {
              type: "callout",
              variant: "warning",
              content: `This chapter could not be generated. Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        });
      }
    }

    if (onChapterCheckpoint) {
      try {
        await onChapterCheckpoint(results);
      } catch (err) {
        console.warn(
          "[Pipeline] Chapter checkpoint save failed (non-fatal):",
          err,
        );
      }
    }
  }

  results.sort((a, b) => a.index - b.index);

  emitter.emitStageComplete(
    "write_chapters",
    `Wrote ${results.length} chapters`,
    4,
    5,
  );

  return results;
}
