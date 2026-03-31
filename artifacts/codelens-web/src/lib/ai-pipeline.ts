import {
  getStage1Prompt,
  getStage2Prompt,
  getStage3Prompt,
  type TargetAudience,
} from "./prompts";
import { generateText } from "./llm";

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

/**
 * Safely parse JSON from AI model output.
 * Models like gemini-2.5-flash can produce JSON with invalid
 * escape sequences, unescaped control characters, or raw code
 * snippets that break JSON.parse().
 */
function safeParseJson(raw: string): unknown {
  // 1. Remove BOM and trim whitespace
  let cleaned = raw.trim().replace(/^\uFEFF/, "");

  // 2. Extract JSON object if wrapped in markdown code fences
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) cleaned = fenced[1].trim();

  // 3. Extract JSON object/array if extra text surrounds it
  const objMatch = cleaned.match(/[{[][\s\S]*[\]}]/);
  if (objMatch) cleaned = objMatch[0];

  // 4. Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch {
    // continue to fixes
  }

  // 5. Fix: remove all control characters (0x00-0x1F) that aren't escaped
  //    These appear in raw code snippets from the model
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

  // 6. Fix: the model sometimes outputs raw newlines inside JSON strings
  //    (e.g., "code": "line1\nline2" where \n is a literal newline)
  //    Strategy: walk through the JSON and escape them
  cleaned = escapeControlInJsonStrings(cleaned);

  // 7. Try parsing again
  try {
    return JSON.parse(cleaned);
  } catch {
    // continue to fallback
  }

  // 8. Last resort: extract the largest valid JSON substring
  const start = cleaned.search(/[{[]/);
  const lastClose = Math.max(
    cleaned.lastIndexOf("}"),
    cleaned.lastIndexOf("]"),
  );
  if (start >= 0 && lastClose > start) {
    const slice = cleaned.slice(start, lastClose + 1);
    try {
      return JSON.parse(slice);
    } catch (e) {
      throw new Error(
        `Failed to parse AI response as JSON. Error: ${e instanceof Error ? e.message : "unknown"}. Raw (first 300 chars): ${slice.slice(0, 300)}`,
      );
    }
  }
  throw new Error(
    `Failed to parse AI response as JSON. Raw (first 300 chars): ${cleaned.slice(0, 300)}`,
  );
}

/**
 * Escape control characters (newlines, tabs, etc.) that appear
 * LITERALLY inside JSON string values — the AI model sometimes
 * outputs raw code snippets without escaping them.
 */
function escapeControlInJsonStrings(json: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (escaped) {
      result.push(ch);
      escaped = false;
      continue;
    }

    if (ch === "\\" && inString) {
      result.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      result.push(ch);
      continue;
    }

    if (inString) {
      switch (ch) {
        case "\n":
          result.push("\\n");
          break;
        case "\r":
          result.push("\\r");
          break;
        case "\t":
          result.push("\\t");
          break;
        case "\b":
          result.push("\\b");
          break;
        case "\f":
          result.push("\\f");
          break;
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
