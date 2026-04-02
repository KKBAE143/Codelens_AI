import {
  getStage1Prompt,
  getStage2Prompt,
  getStage3Prompt,
  type TargetAudience,
} from "./prompts";
import { generateText } from "./llm";
import { safeParseJson } from "./utils/safe-json-parse";

interface RepoFile {
  path: string;
  content: string;
  size: number;
}

interface StageResult<T> {
  data: T;
  progressDetail: string;
}

function formatLlmLabel(provider: string, model: string): string {
  return `${provider}:${model}`;
}

function buildFileContext(
  fileTree: string[],
  files: RepoFile[],
  languageBreakdown: Record<string, number>,
): string {
  const treeStr = fileTree.slice(0, 200).join("\n");
  const langStr = Object.entries(languageBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `${lang}: ${count} files`)
    .join(", ");

  const filesStr = files
    .map((f) => `=== FILE: ${f.path} (${f.size} bytes) ===\n${f.content}`)
    .join("\n\n");

  return `## Repository File Tree (${fileTree.length} files total)
Language breakdown: ${langStr}

${treeStr}
${fileTree.length > 200 ? `\n... and ${fileTree.length - 200} more files` : ""}

## Key File Contents (${files.length} files read)

${filesStr}`;
}

export async function runStage1(
  fileTree: string[],
  files: RepoFile[],
  languageBreakdown: Record<string, number>,
  audience: TargetAudience,
  changeContext?: string,
): Promise<StageResult<Record<string, unknown>>> {
  const systemPrompt = getStage1Prompt(audience);
  const fileContext = buildFileContext(fileTree, files, languageBreakdown);
  const fullPrompt = changeContext
    ? `${systemPrompt}\n\n${changeContext}\n\n${fileContext}`
    : `${systemPrompt}\n\n${fileContext}`;

  const response = await generateText({
    task: "stage1",
    prompt: fullPrompt,
    responseMimeType: "application/json",
    maxOutputTokens: 8192,
  });
  const llmLabel = formatLlmLabel(response.provider, response.model);
  console.log(`[AI][stage1] Using ${llmLabel}`);

  const text = response.text ?? "";
  let analysis: Record<string, unknown>;

  try {
    analysis = safeParseJson(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Stage 1 failed: Could not parse analysis JSON from AI response",
    );
  }

  const progressDetail =
    (analysis.progress_detail as string) ||
    `Analyzed ${files.length} files, identified ${
      (analysis.actors as unknown[])?.length ?? 0
    } components via ${llmLabel}`;

  return { data: analysis, progressDetail };
}

export async function runStage2(
  analysis: Record<string, unknown>,
  audience: TargetAudience,
  changeContext?: string,
): Promise<StageResult<Record<string, unknown>>> {
  const systemPrompt = getStage2Prompt(audience);
  const contextPrefix = changeContext ? `${changeContext}\n\n` : "";

  const response = await generateText({
    task: "stage2",
    prompt: `${systemPrompt}\n\n${contextPrefix}Here is the codebase analysis to design a curriculum for:\n\n${JSON.stringify(analysis, null, 2)}`,
    responseMimeType: "application/json",
    maxOutputTokens: 8192,
  });
  const llmLabel = formatLlmLabel(response.provider, response.model);
  console.log(`[AI][stage2] Using ${llmLabel}`);

  const text = response.text ?? "";
  let curriculum: Record<string, unknown>;

  try {
    curriculum = safeParseJson(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      "Stage 2 failed: Could not parse curriculum JSON from AI response",
    );
  }

  const modules = (curriculum.modules as unknown[]) || [];

  if (!curriculum.debugging_guide) {
    curriculum.debugging_guide = {
      title: "The 5 Most Likely Things to Break",
      issues: [
        {
          symptom: "Application fails to start",
          root_cause:
            "Missing environment variables or incorrect configuration",
          file_to_check: "Configuration files",
          function_to_check: "startup/initialization",
          fix_hint:
            "Check all required environment variables are set correctly",
        },
      ],
    };
  }

  const progressDetail = `Designed ${modules.length} modules with quizzes, code translations, and interactive elements via ${llmLabel}`;

  return { data: curriculum, progressDetail };
}

export async function runStage3(
  analysis: Record<string, unknown>,
  curriculum: Record<string, unknown>,
  audience: TargetAudience,
  changeContext?: string,
): Promise<StageResult<string>> {
  const systemPrompt = getStage3Prompt(audience);
  const contextPrefix = changeContext ? `${changeContext}\n\n` : "";

  const response = await generateText({
    task: "stage3",
    prompt: `${systemPrompt}\n\n${contextPrefix}Codebase Analysis:\n${JSON.stringify(analysis, null, 2)}\n\nCurriculum Design:\n${JSON.stringify(curriculum, null, 2)}`,
    maxOutputTokens: 32768,
  });
  const llmLabel = formatLlmLabel(response.provider, response.model);
  console.log(`[AI][stage3] Using ${llmLabel}`);

  let html = response.text ?? "";

  const htmlMatch = html.match(/<!DOCTYPE html>[\s\S]*<\/html>/i);
  if (htmlMatch) {
    html = htmlMatch[0];
  }

  if (!html.includes("<!DOCTYPE html>") && !html.includes("<html")) {
    throw new Error("Stage 3 failed: AI did not generate valid HTML output");
  }

  return {
    data: html,
    progressDetail: `Generated interactive HTML course (${Math.round(html.length / 1024)}KB) via ${llmLabel}`,
  };
}
