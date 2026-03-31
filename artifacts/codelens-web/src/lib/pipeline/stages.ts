import { generateText } from "../llm";
import { countTokens } from "../token-counter";
import { v2ChapterSchema } from "../v2-schema";
import type { TargetAudience } from "../prompts";
import type { RepoExtraction } from "../github";
import type { PipelineEmitter } from "./events";
import {
  getAbstractionPrompt,
  getRelationshipPrompt,
  getChapterOrderPrompt,
  getChapterWritePrompt,
  getSetupChapterPrompt,
  getDependenciesChapterPrompt,
  getTroubleshootingChapterPrompt,
  getOverviewChapterPrompt,
} from "./prompts";
import YAML from "yaml";

export interface Abstraction {
  name: string;
  description: string;
  file_indices: number[];
  file_paths?: string[];
}

export interface Relationship {
  from: string;
  to: string;
  relation: string;
  description: string;
}

export interface OrderedChapter {
  index: number;
  title: string;
  learningObjective: string;
  estimatedMinutes: number;
  abstractionRef?: string;
  focusAreas?: string[];
  chapterType?: "overview" | "setup" | "abstraction" | "dependencies" | "troubleshooting";
}

export interface ChapterResult {
  index: number;
  title: string;
  learningObjective?: string;
  estimatedMinutes?: number;
  focusAreas?: string[];
  abstractionRef?: string;
  blocks: unknown[];
  regenerated?: boolean;
}

export interface PipelineConfig {
  audience: TargetAudience;
  depth: "quick" | "full" | "deep";
  focusAreas: string[];
  customContext?: string;
}

function safeParseJson(raw: string): unknown {
  let cleaned = raw.trim().replace(/^\uFEFF/, "");

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) cleaned = fenced[1].trim();

  const objMatch = cleaned.match(/[{[][\s\S]*[\]}]/);
  if (objMatch) cleaned = objMatch[0];

  try {
    return JSON.parse(cleaned);
  } catch {
  }

  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  cleaned = escapeControlInJsonStrings(cleaned);

  try {
    return JSON.parse(cleaned);
  } catch {
  }

  const start = cleaned.search(/[{[]/);
  const lastClose = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (start >= 0 && lastClose > start) {
    const slice = cleaned.slice(start, lastClose + 1);
    try {
      return JSON.parse(slice);
    } catch (e) {
      throw new Error(`Failed to parse JSON: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }
  throw new Error(`Failed to parse JSON from AI response`);
}

function escapeControlInJsonStrings(json: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escaped) { result.push(ch); escaped = false; continue; }
    if (ch === "\\" && inString) { result.push(ch); escaped = true; continue; }
    if (ch === '"') { inString = !inString; result.push(ch); continue; }
    if (inString) {
      switch (ch) {
        case "\n": result.push("\\n"); break;
        case "\r": result.push("\\r"); break;
        case "\t": result.push("\\t"); break;
        case "\b": result.push("\\b"); break;
        case "\f": result.push("\\f"); break;
        default:
          if (ch.charCodeAt(0) < 0x20) {
            result.push("\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
          } else {
            result.push(ch);
          }
      }
    } else {
      result.push(ch);
    }
  }
  return result.join("");
}

function safeParseYaml(raw: string): unknown {
  let cleaned = raw.trim().replace(/^\uFEFF/, "");
  const fenced = cleaned.match(/```(?:ya?ml)?\s*([\s\S]*?)\s*```/);
  if (fenced) cleaned = fenced[1].trim();

  try {
    return YAML.parse(cleaned);
  } catch {
    const jsonMatch = cleaned.match(/[{[][\s\S]*[\]}]/);
    if (jsonMatch) {
      try { return JSON.parse(jsonMatch[0]); } catch { }
    }
    throw new Error("Failed to parse YAML from AI response");
  }
}

export async function runStage1Abstractions(
  extraction: RepoExtraction,
  config: PipelineConfig,
  emitter: PipelineEmitter,
): Promise<Abstraction[]> {
  emitter.emitStageStart("identify_abstractions", "Identifying core abstractions...", 0, 5);

  const prompt = getAbstractionPrompt(config.audience, config.depth, config.customContext);
  const contextTokens = countTokens(extraction.packedContext);
  console.log(`[Pipeline][Stage1] Context tokens: ${contextTokens}`);

  let abstractions: Abstraction[] = [];
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const fullPrompt = lastError
        ? `${prompt}\n\nPrevious attempt failed with error: ${lastError}\nPlease fix and try again.\n\n${extraction.packedContext}`
        : `${prompt}\n\n${extraction.packedContext}`;

      const response = await generateText({
        task: "stage1",
        prompt: fullPrompt,
        maxOutputTokens: 8192,
      });

      const parsed = safeParseYaml(response.text);
      if (!Array.isArray(parsed)) {
        lastError = "Expected YAML array of abstractions";
        continue;
      }

      abstractions = parsed.map((item: Record<string, unknown>) => {
        const indices = Array.isArray(item.file_indices)
          ? item.file_indices.map(Number).filter(n => !isNaN(n))
          : [];
        const paths = indices
          .filter(idx => idx < extraction.files.length)
          .map(idx => extraction.files[idx].path);
        return {
          name: String(item.name || ""),
          description: String(item.description || ""),
          file_indices: indices,
          file_paths: paths,
        };
      }).filter(a => a.name && a.description);

      if (abstractions.length < 3) {
        lastError = `Only ${abstractions.length} abstractions found, expected at least 3`;
        continue;
      }

      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown error";
      if (attempt === 3) throw new Error(`Stage 1 failed after 3 attempts: ${lastError}`);
    }
  }

  for (let i = 0; i < abstractions.length; i++) {
    emitter.emitAbstractionIdentified(abstractions[i].name, i + 1, abstractions.length);
  }

  emitter.emitStageComplete(
    "identify_abstractions",
    `Identified ${abstractions.length} abstractions`,
    1, 5,
    abstractions.map(a => a.name),
  );

  return abstractions;
}

export async function runStage2Relationships(
  abstractions: Abstraction[],
  extraction: RepoExtraction,
  config: PipelineConfig,
  emitter: PipelineEmitter,
): Promise<Relationship[]> {
  emitter.emitStageStart("analyze_relationships", "Analyzing relationships between abstractions...", 1, 5);

  const prompt = getRelationshipPrompt(config.audience);

  const abstractionContext = abstractions.map((a, i) => {
    const fileExcerpts = a.file_indices
      .filter(idx => idx < extraction.files.length)
      .map(idx => {
        const f = extraction.files[idx];
        const lines = f.content.split("\n").slice(0, 50).join("\n");
        return `File: ${f.path}\n${lines}`;
      })
      .join("\n\n");

    return `Abstraction ${i + 1}: ${a.name}\n${a.description}\n\nKey files:\n${fileExcerpts}`;
  }).join("\n\n---\n\n");

  let contextStr = `${prompt}\n\n${abstractionContext}`;
  const tokens = countTokens(contextStr);
  if (tokens > 60000) {
    const abstractionSummary = abstractions.map((a, i) =>
      `${i + 1}. ${a.name}: ${a.description.slice(0, 200)}\nFiles: ${a.file_indices.map(idx => extraction.files[idx]?.path || `file_${idx}`).join(", ")}`
    ).join("\n\n");
    contextStr = `${prompt}\n\n${abstractionSummary}`;
  }

  let relationships: Relationship[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await generateText({
        task: "stage2",
        prompt: contextStr,
        maxOutputTokens: 4096,
      });

      const parsed = safeParseYaml(response.text);
      if (!Array.isArray(parsed)) {
        if (attempt === 3) break;
        continue;
      }

      relationships = parsed.map((item: Record<string, unknown>) => ({
        from: String(item.from || ""),
        to: String(item.to || ""),
        relation: String(item.relation || "calls"),
        description: String(item.description || ""),
      })).filter(r => r.from && r.to);

      break;
    } catch (error) {
      if (attempt === 3) {
        console.warn("[Pipeline][Stage2] Failed after 3 attempts, proceeding with empty relationships");
      }
    }
  }

  emitter.emitStageComplete(
    "analyze_relationships",
    `Found ${relationships.length} relationships`,
    2, 5,
  );

  return relationships;
}

export async function runStage3Order(
  abstractions: Abstraction[],
  relationships: Relationship[],
  config: PipelineConfig,
  emitter: PipelineEmitter,
): Promise<OrderedChapter[]> {
  emitter.emitStageStart("order_chapters", "Determining optimal learning order...", 2, 5);

  const prompt = getChapterOrderPrompt(config.audience, config.depth, config.focusAreas);

  const abstractionList = abstractions.map((a, i) =>
    `${i + 1}. ${a.name}: ${a.description.slice(0, 150)}`
  ).join("\n");

  const relationshipList = relationships.map(r =>
    `${r.from} --[${r.relation}]--> ${r.to}: ${r.description}`
  ).join("\n");

  const contextStr = `${prompt}\n\nAbstractions:\n${abstractionList}\n\nRelationships:\n${relationshipList}`;

  let orderedChapters: OrderedChapter[] = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await generateText({
        task: "stage2",
        prompt: contextStr,
        maxOutputTokens: 4096,
      });

      const parsed = safeParseYaml(response.text);
      if (!Array.isArray(parsed)) {
        if (attempt === 3) break;
        continue;
      }

      orderedChapters = parsed.map((item: Record<string, unknown>, idx: number) => ({
        index: Number(item.index) || idx + 2,
        title: String(item.title || ""),
        learningObjective: String(item.learningObjective || item.learning_objective || ""),
        estimatedMinutes: Number(item.estimatedMinutes || item.estimated_minutes || 8),
        abstractionRef: String(item.abstractionRef || item.abstraction_ref || ""),
        focusAreas: Array.isArray(item.focusAreas || item.focus_areas) ? (item.focusAreas || item.focus_areas) as string[] : [],
        chapterType: "abstraction" as const,
      })).filter(c => c.title);

      break;
    } catch (error) {
      if (attempt === 3) {
        orderedChapters = abstractions.map((a, i) => ({
          index: i + 2,
          title: a.name,
          learningObjective: a.description.slice(0, 100),
          estimatedMinutes: 8,
          abstractionRef: a.name,
          chapterType: "abstraction" as const,
        }));
      }
    }
  }

  const fullChapters: OrderedChapter[] = [
    { index: 0, title: "Overview & Architecture", learningObjective: "Understand the big picture", estimatedMinutes: 5, chapterType: "overview" },
    { index: 1, title: "Setup & Installation", learningObjective: "Get the project running locally", estimatedMinutes: 10, chapterType: "setup" },
    ...orderedChapters.map((c, i) => ({ ...c, index: i + 2 })),
    { index: orderedChapters.length + 2, title: "Dependencies Explained", learningObjective: "Understand every dependency", estimatedMinutes: 8, chapterType: "dependencies" },
    { index: orderedChapters.length + 3, title: "Troubleshooting & Common Errors", learningObjective: "Know how to debug common issues", estimatedMinutes: 10, chapterType: "troubleshooting" },
  ];

  emitter.emitStageComplete(
    "order_chapters",
    `Ordered ${fullChapters.length} chapters`,
    3, 5,
  );

  return fullChapters;
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
  emitter.emitStageStart("write_chapters", `Writing ${chapters.length} chapters...`, 3, 5);

  const completedMap = new Map<number, ChapterResult>();
  if (existingChapters) {
    for (const ch of existingChapters) {
      completedMap.set(ch.index, ch);
    }
  }

  const chaptersToWrite = chapters.filter(c => !completedMap.has(c.index));
  const concurrency = 3;
  const results: ChapterResult[] = [...completedMap.values()];

  for (let i = 0; i < chaptersToWrite.length; i += concurrency) {
    const batch = chaptersToWrite.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(
      batch.map(chapter => writeOneChapter(chapter, abstractions, relationships, extraction, config, emitter, chapters.length))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const chapter = batch[j];
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
        emitter.emitChapterComplete(chapter.index, chapter.title, chapters.length);
      } else {
        const error = result.status === "rejected" ? result.reason : "Unknown error";
        emitter.emitChapterFailed(chapter.index, chapter.title, chapters.length, String(error));
        results.push({
          index: chapter.index,
          title: chapter.title,
          learningObjective: chapter.learningObjective,
          estimatedMinutes: chapter.estimatedMinutes,
          blocks: [{
            type: "callout",
            variant: "warning",
            content: `This chapter could not be generated. Error: ${error instanceof Error ? error.message : String(error)}`,
          }],
        });
      }
    }

    if (onChapterCheckpoint) {
      try {
        await onChapterCheckpoint(results);
      } catch (err) {
        console.warn("[Pipeline] Chapter checkpoint save failed (non-fatal):", err);
      }
    }
  }

  results.sort((a, b) => a.index - b.index);

  emitter.emitStageComplete("write_chapters", `Wrote ${results.length} chapters`, 4, 5);

  return results;
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

  let prompt: string;
  let contextData: string;

  if (chapter.chapterType === "overview") {
    prompt = getOverviewChapterPrompt(config.audience);
    const relGraph = relationships.map(r => `${r.from} -> ${r.to} (${r.relation})`).join("\n");
    contextData = `Repository: ${extraction.repoName}\nOwner: ${extraction.owner}\nFiles: ${extraction.totalFilesCatalogued}\nLanguages: ${Object.entries(extraction.languageBreakdown).map(([l, c]) => `${l}: ${c}`).join(", ")}\n\nAbstractions:\n${abstractions.map(a => `- ${a.name}: ${a.description}`).join("\n")}\n\nRelationship graph:\n${relGraph}\n\nFile tree (first 100):\n${extraction.fileTree.slice(0, 100).join("\n")}`;
  } else if (chapter.chapterType === "setup") {
    prompt = getSetupChapterPrompt(config.audience);
    const pkgData = extraction.parsedPackageJson
      ? `Package.json:\nDependencies: ${extraction.parsedPackageJson.dependencies.map(d => `${d.name}@${d.version}`).join(", ")}\nScripts: ${JSON.stringify(extraction.parsedPackageJson.scripts)}`
      : "No package.json found";
    const envData = extraction.parsedEnvExample
      ? `Environment variables:\n${extraction.parsedEnvExample.map(v => `${v.key}=${v.value} ${v.comment ? `# ${v.comment}` : ""}`).join("\n")}`
      : "No .env.example found";
    const dockerData = extraction.parsedDockerfile
      ? `Dockerfile:\nBase: ${extraction.parsedDockerfile.baseImage}\nPorts: ${extraction.parsedDockerfile.exposePorts.join(", ")}\nCommands: ${extraction.parsedDockerfile.keyCommands.join("; ")}`
      : "No Dockerfile found";
    contextData = `${pkgData}\n\n${envData}\n\n${dockerData}`;
  } else if (chapter.chapterType === "dependencies") {
    prompt = getDependenciesChapterPrompt(config.audience);
    contextData = extraction.parsedPackageJson
      ? `Dependencies:\n${extraction.parsedPackageJson.dependencies.map(d => `- ${d.name}@${d.version}`).join("\n")}\n\nDev Dependencies:\n${extraction.parsedPackageJson.devDependencies.map(d => `- ${d.name}@${d.version}`).join("\n")}`
      : "No package.json data available";
  } else if (chapter.chapterType === "troubleshooting") {
    prompt = getTroubleshootingChapterPrompt(config.audience);
    contextData = `Repository: ${extraction.repoName}\nKey files:\n${extraction.files.slice(0, 20).map(f => f.path).join("\n")}\n\nAbstractions:\n${abstractions.map(a => `- ${a.name}: ${a.description}`).join("\n")}`;
  } else {
    const abstraction = abstractions.find(a => a.name === chapter.abstractionRef);
    const relContext = relationships
      .filter(r => r.from === chapter.abstractionRef || r.to === chapter.abstractionRef)
      .map(r => `${r.from} --[${r.relation}]--> ${r.to}: ${r.description}`)
      .join("\n");

    prompt = getChapterWritePrompt(
      config.audience,
      config.depth,
      chapter.abstractionRef || chapter.title,
      abstraction?.description || "",
      relContext,
      config.customContext,
    );

    if (abstraction) {
      const fileContents = abstraction.file_indices
        .filter(idx => idx < extraction.files.length)
        .map(idx => {
          const f = extraction.files[idx];
          return `=== ${f.path} ===\n${f.content}`;
        })
        .join("\n\n");

      contextData = fileContents;

      const totalTokens = countTokens(prompt + contextData);
      if (totalTokens > 60000) {
        const truncatedFiles = abstraction.file_indices
          .filter(idx => idx < extraction.files.length)
          .map(idx => {
            const f = extraction.files[idx];
            const lines = f.content.split("\n");
            const maxLines = Math.min(lines.length, 200);
            return `=== ${f.path} (first ${maxLines} lines) ===\n${lines.slice(0, maxLines).join("\n")}`;
          })
          .join("\n\n");
        contextData = truncatedFiles;
      }
    } else {
      contextData = `No specific files assigned to this abstraction.`;
    }
  }

  const fullPrompt = `${prompt}\n\n${contextData}`;

  let blocks: unknown[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await generateText({
        task: "stage3",
        prompt: fullPrompt,
        responseMimeType: "application/json",
        maxOutputTokens: 16384,
      });

      const parsed = safeParseJson(response.text) as Record<string, unknown>;
      const rawBlocks = Array.isArray(parsed.blocks) ? parsed.blocks : Array.isArray(parsed) ? parsed : [];

      if (rawBlocks.length === 0) {
        throw new Error("No blocks generated");
      }

      blocks = rawBlocks.map((block: unknown) => {
        try {
          return v2ChapterSchema.shape.blocks.element.parse(block);
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (blocks.length > 0) break;
      throw new Error("All blocks failed validation");
    } catch (error) {
      if (attempt === 2) {
        blocks = [{
          type: "text",
          content: `## ${chapter.title}\n\nThis chapter covers ${chapter.abstractionRef || chapter.title}. ${chapter.learningObjective || ""}`,
        }];
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

export function assembleV2Course(
  chapters: ChapterResult[],
  extraction: RepoExtraction,
  relationships: Relationship[],
  abstractions: Abstraction[],
  config: PipelineConfig,
): string {
  const overviewGraph = {
    nodes: abstractions.map((a, i) => ({
      id: a.name.toLowerCase().replace(/\s+/g, "-"),
      label: a.name,
      moduleIndex: i + 2,
      connections: relationships.filter(r => r.from === a.name || r.to === a.name).length,
    })),
    edges: relationships.map(r => ({
      from: r.from.toLowerCase().replace(/\s+/g, "-"),
      to: r.to.toLowerCase().replace(/\s+/g, "-"),
      relation: r.relation,
      label: r.description.slice(0, 50),
    })),
  };

  const totalMinutes = chapters.reduce((sum, c) => sum + (c.estimatedMinutes || 8), 0);

  const courseData = {
    version: 2,
    repoName: extraction.repoName,
    ownerName: extraction.owner,
    githubUrl: `https://github.com/${extraction.owner}/${extraction.repoName}`,
    persona: config.audience,
    depth: config.depth,
    totalModules: chapters.length,
    estimatedTotalMinutes: totalMinutes,
    languages: Object.keys(extraction.languageBreakdown),
    frameworks: [],
    fileCount: extraction.totalFilesCatalogued,
    abstractionCount: abstractions.length,
    overviewGraph,
    modules: chapters.map(ch => ({
      index: ch.index,
      title: ch.title,
      learningObjective: ch.learningObjective,
      estimatedMinutes: ch.estimatedMinutes,
      focusAreas: ch.focusAreas,
      blocks: ch.blocks,
    })),
  };

  return `__codelens_v2__${JSON.stringify(courseData)}`;
}
