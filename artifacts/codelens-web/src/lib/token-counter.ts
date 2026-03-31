import { encodingForModel } from "js-tiktoken";

let encoder: ReturnType<typeof encodingForModel> | null = null;

function getEncoder() {
  if (!encoder) {
    encoder = encodingForModel("gpt-4o");
  }
  return encoder;
}

export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const enc = getEncoder();
  const tokens = enc.encode(text);
  if (tokens.length <= maxTokens) return text;
  const truncated = tokens.slice(0, maxTokens);
  return enc.decode(truncated);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

const FUNCTION_BOUNDARY_PATTERNS = [
  /^export\s+(?:default\s+)?(?:async\s+)?function\s/,
  /^(?:async\s+)?function\s/,
  /^export\s+(?:default\s+)?class\s/,
  /^class\s/,
  /^export\s+(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/,
  /^(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(/,
  /^export\s+(?:default\s+)?interface\s/,
  /^export\s+(?:default\s+)?type\s/,
  /^def\s+\w+\s*\(/,
  /^class\s+\w+/,
  /^pub\s+(?:async\s+)?fn\s/,
  /^fn\s+\w+/,
  /^func\s+/,
  /^type\s+\w+\s+(?:struct|interface)/,
  /^\s*(?:public|private|protected)\s+.*\s+\w+\s*\(/,
];

function isFunctionBoundary(line: string): boolean {
  const trimmed = line.trimStart();
  return FUNCTION_BOUNDARY_PATTERNS.some(p => p.test(trimmed));
}

export function truncateAtFunctionBoundary(content: string, maxTokens: number): string {
  const tokenCount = countTokens(content);
  if (tokenCount <= maxTokens) return content;

  const lines = content.split("\n");
  const rough = truncateToTokenBudget(content, maxTokens);
  const roughLineCount = rough.split("\n").length;

  for (let i = roughLineCount - 1; i >= Math.max(0, roughLineCount - 50); i--) {
    if (i < lines.length && isFunctionBoundary(lines[i])) {
      const result = lines.slice(0, i).join("\n");
      if (result.length > rough.length * 0.4) {
        return result;
      }
    }
  }

  for (let i = roughLineCount - 1; i >= Math.max(0, roughLineCount - 50); i--) {
    if (i < lines.length && lines[i].trimStart() === "}") {
      const result = lines.slice(0, i + 1).join("\n");
      if (result.length > rough.length * 0.4) {
        return result;
      }
    }
  }

  for (let i = roughLineCount - 1; i >= Math.max(0, roughLineCount - 30); i--) {
    if (i < lines.length && lines[i].trim() === "") {
      return lines.slice(0, i).join("\n");
    }
  }

  return rough;
}

export function getDepthTokenBudget(depth: "quick" | "full" | "deep"): number {
  switch (depth) {
    case "quick": return 4096;
    case "full": return 8192;
    case "deep": return 16384;
  }
}

export function getDepthContextBudget(depth: "quick" | "full" | "deep"): number {
  switch (depth) {
    case "quick": return 20000;
    case "full": return 40000;
    case "deep": return 60000;
  }
}
