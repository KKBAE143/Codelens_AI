import { v2ChapterSchema } from "../v2-schema";
import YAML from "yaml";
import type { Abstraction, Relationship, OrderedChapter } from "./types";

function normalizeCalloutVariant(value: unknown): string {
  const normalized = String(value || "tip")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
  if (
    ["warning", "tip", "ai-hint", "first-pr", "security", "command"].includes(
      normalized,
    )
  ) {
    return normalized;
  }
  return "tip";
}

function inferDiagramType(
  source: string,
): "flowchart" | "sequenceDiagram" | "erDiagram" | "classDiagram" | "graph" {
  const trimmed = source.trim();
  if (trimmed.startsWith("sequenceDiagram")) return "sequenceDiagram";
  if (trimmed.startsWith("erDiagram")) return "erDiagram";
  if (trimmed.startsWith("classDiagram")) return "classDiagram";
  if (trimmed.startsWith("graph ")) return "graph";
  return "flowchart";
}

function normalizeQuizOptions(
  raw: unknown,
): Array<{ text: string; correct: boolean; explanation: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((option) => {
      if (!option || typeof option !== "object") return null;
      const record = option as Record<string, unknown>;
      const text = String(
        record.text || record.label || record.answer || "",
      ).trim();
      const explanation = String(
        record.explanation ||
          record.reason ||
          record.why ||
          "Because this best matches the code.",
      ).trim();
      const correctRaw =
        record.correct ?? record.isCorrect ?? record.is_correct;
      const correct =
        typeof correctRaw === "boolean"
          ? correctRaw
          : String(correctRaw || "").toLowerCase() === "true";
      if (!text) return null;
      return { text, correct, explanation };
    })
    .filter(
      (
        option,
      ): option is { text: string; correct: boolean; explanation: string } =>
        !!option,
    );
}

export function normalizeBlock(block: unknown): unknown {
  if (!block || typeof block !== "object") return null;

  const record = block as Record<string, unknown>;
  const type = String(record.type || record.blockType || "").trim();

  switch (type) {
    case "text":
      return {
        type: "text",
        content: String(
          record.content || record.text || record.markdown || "",
        ).trim(),
      };
    case "code":
      return {
        type: "code",
        language: String(record.language || record.lang || "text").trim(),
        filePath: record.filePath || record.path || record.file || undefined,
        lineStart:
          typeof record.lineStart === "number"
            ? record.lineStart
            : typeof record.startLine === "number"
              ? record.startLine
              : undefined,
        lineEnd:
          typeof record.lineEnd === "number"
            ? record.lineEnd
            : typeof record.endLine === "number"
              ? record.endLine
              : undefined,
        content: String(record.content || record.code || "").trim(),
        caption:
          typeof record.caption === "string"
            ? record.caption
            : typeof record.explanation === "string"
              ? record.explanation
              : undefined,
      };
    case "mermaid": {
      const source = String(
        record.source || record.diagram || record.content || "",
      ).trim();
      return {
        type: "mermaid",
        diagramType:
          typeof record.diagramType === "string"
            ? record.diagramType
            : inferDiagramType(source),
        source,
        caption:
          typeof record.caption === "string" ? record.caption : undefined,
      };
    }
    case "quiz":
      return {
        type: "quiz",
        question: String(record.question || record.prompt || "").trim(),
        scenario:
          typeof record.scenario === "string"
            ? record.scenario
            : typeof record.context === "string"
              ? record.context
              : undefined,
        options: normalizeQuizOptions(record.options),
      };
    case "callout":
      return {
        type: "callout",
        variant: normalizeCalloutVariant(record.variant),
        content: String(record.content || record.text || "").trim(),
      };
    case "file-list": {
      const files = Array.isArray(record.files)
        ? record.files
            .map((file) => {
              if (typeof file === "string") {
                return { path: file, role: "Relevant file" };
              }
              if (!file || typeof file !== "object") return null;
              const item = file as Record<string, unknown>;
              const path = String(
                item.path || item.filePath || item.file || "",
              ).trim();
              if (!path) return null;
              return {
                path,
                role: String(item.role || item.description || "Relevant file"),
                lineCount:
                  typeof item.lineCount === "number"
                    ? item.lineCount
                    : undefined,
                githubUrl:
                  typeof item.githubUrl === "string"
                    ? item.githubUrl
                    : undefined,
              };
            })
            .filter(Boolean)
        : [];
      return { type: "file-list", files };
    }
    case "architecture-card":
      return {
        type: "architecture-card",
        decision: String(record.decision || "").trim(),
        rationale: String(record.rationale || record.why || "").trim(),
        tradeoffs: String(
          record.tradeoffs || record.tradeoffsConsidered || "",
        ).trim(),
        alternatives:
          typeof record.alternatives === "string"
            ? record.alternatives
            : undefined,
      };
    case "dependency-card":
      return {
        type: "dependency-card",
        packageName: String(record.packageName || record.name || "").trim(),
        version:
          typeof record.version === "string" ? record.version : undefined,
        purpose: String(record.purpose || record.why || "").trim(),
        whatBreaksWithout:
          typeof record.whatBreaksWithout === "string"
            ? record.whatBreaksWithout
            : undefined,
        alternatives:
          typeof record.alternatives === "string"
            ? record.alternatives
            : undefined,
      };
    case "env-var-card":
      return {
        type: "env-var-card",
        varName: String(
          record.varName || record.name || record.key || "",
        ).trim(),
        required: Boolean(record.required),
        purpose: String(record.purpose || record.why || "").trim(),
        exampleValue:
          typeof record.exampleValue === "string"
            ? record.exampleValue
            : typeof record.example === "string"
              ? record.example
              : undefined,
        whatBreaksWithout:
          typeof record.whatBreaksWithout === "string"
            ? record.whatBreaksWithout
            : undefined,
      };
    case "command-card":
      return {
        type: "command-card",
        command: String(record.command || "").trim(),
        when: String(record.when || record.purpose || "").trim(),
        expectedOutput:
          typeof record.expectedOutput === "string"
            ? record.expectedOutput
            : undefined,
        commonErrors: Array.isArray(record.commonErrors)
          ? record.commonErrors
          : undefined,
      };
    case "exercise": {
      const exFiles = Array.isArray(record.files)
        ? record.files
            .map((f) => {
              if (typeof f === "string") return { path: f };
              if (!f || typeof f !== "object") return null;
              const fi = f as Record<string, unknown>;
              const path = String(fi.path || fi.filePath || "").trim();
              if (!path) return null;
              return {
                path,
                githubUrl: typeof fi.githubUrl === "string" ? fi.githubUrl : undefined,
              };
            })
            .filter(Boolean)
        : undefined;
      return {
        type: "exercise",
        title: String(record.title || record.name || "Exercise").trim(),
        task: String(record.task || record.description || record.objective || "").trim(),
        difficulty:
          ["easy", "medium", "hard"].includes(String(record.difficulty))
            ? record.difficulty
            : undefined,
        files: exFiles && exFiles.length > 0 ? exFiles : undefined,
        verificationHint:
          typeof record.verificationHint === "string"
            ? record.verificationHint
            : typeof record.hint === "string"
              ? record.hint
              : undefined,
      };
    }
    default:
      return null;
  }
}

export function buildFallbackBlocks(
  chapter: OrderedChapter,
  abstractions: Abstraction[],
  relationships: Relationship[],
  extraction: { files: Array<{ path: string; content: string }>; owner: string; repoName: string },
): unknown[] {
  const abstraction = abstractions.find(
    (item) => item.name === chapter.abstractionRef,
  );
  const relatedFiles = abstraction
    ? abstraction.file_indices
        .filter((idx) => idx < extraction.files.length)
        .map((idx) => extraction.files[idx])
    : [];
  const fileList = relatedFiles.slice(0, 8).map((file) => ({
    path: file.path,
    role: `Core implementation file for ${chapter.abstractionRef || chapter.title} — contains key logic and data structures`,
    lineCount: file.content.split("\n").length,
  }));

  const relatedRels = relationships.filter(
    (rel) =>
      rel.from === chapter.abstractionRef ||
      rel.to === chapter.abstractionRef,
  );
  const relationshipSummary = relatedRels
    .slice(0, 5)
    .map((rel) => `- ${rel.from} ${rel.relation} ${rel.to}: ${rel.description}`)
    .join("\n");

  const blocks: unknown[] = [
    {
      type: "text",
      content: `## ${chapter.title}\n\n${abstraction?.description || `This chapter explains ${chapter.title} in the context of ${extraction.owner}/${extraction.repoName}.`}\n\n${chapter.learningObjective ? `**Learning objective:** ${chapter.learningObjective}` : ""}\n\nThis abstraction is implemented across ${relatedFiles.length} file${relatedFiles.length !== 1 ? "s" : ""} in the \`${extraction.repoName}\` repository. ${relatedRels.length > 0 ? `It connects to ${relatedRels.length} other abstraction${relatedRels.length !== 1 ? "s" : ""} in the system.` : "It operates relatively independently within the codebase."}`,
    },
  ];

  if (fileList.length > 0) {
    blocks.push({ type: "file-list", files: fileList });
  }

  if (relatedRels.length > 0) {
    const escapeMermaid = (text: string) => text.replace(/["\[\]|{}()<>]/g, " ").replace(/\s+/g, " ").trim();
    const mermaidNodes = new Set<string>();
    const mermaidEdges: string[] = [];
    relatedRels.slice(0, 6).forEach((rel) => {
      const fromId = rel.from.replace(/[^a-zA-Z0-9]/g, "_");
      const toId = rel.to.replace(/[^a-zA-Z0-9]/g, "_");
      mermaidNodes.add(`    ${fromId}["${escapeMermaid(rel.from)}"]`);
      mermaidNodes.add(`    ${toId}["${escapeMermaid(rel.to)}"]`);
      mermaidEdges.push(`    ${fromId} -->|${escapeMermaid(rel.relation)}| ${toId}`);
    });
    blocks.push({
      type: "mermaid",
      diagramType: "flowchart",
      source: `graph TD\n${Array.from(mermaidNodes).join("\n")}\n${mermaidEdges.join("\n")}`,
      caption: `How ${chapter.abstractionRef || chapter.title} connects to other parts of the system`,
    });
  }

  if (relationshipSummary) {
    blocks.push({
      type: "callout",
      variant: "tip",
      content: `**Key relationships:**\n${relationshipSummary}`,
    });
  }

  for (const file of relatedFiles.slice(0, 3)) {
    const lines = file.content.split("\n");
    const importEnd = lines.findIndex((l, i) => i > 0 && !l.startsWith("import") && !l.startsWith("from") && !l.startsWith("//") && !l.startsWith("#") && l.trim() !== "");
    const startLine = Math.max(0, importEnd > 0 ? importEnd : 0);
    const excerpt = lines.slice(startLine, startLine + 50).join("\n").trim();
    if (excerpt) {
      blocks.push({
        type: "code",
        language: file.path.split(".").pop() || "text",
        filePath: file.path,
        content: excerpt,
        caption: `Key implementation from ${file.path} — shows the core logic and data structures for ${chapter.abstractionRef || chapter.title}`,
      });
    }
  }

  blocks.push({
    type: "callout",
    variant: "first-pr",
    content: `**Good first contribution:** Look at \`${relatedFiles[0]?.path || "the main implementation file"}\` to understand the core behavior. A good starter task would be adding input validation, improving error messages, or adding unit tests for edge cases.`,
  });

  blocks.push({
    type: "quiz",
    question: `You're investigating a bug related to ${chapter.abstractionRef || chapter.title}. A user reports unexpected behavior. Which file would you check first and why?`,
    scenario: `A production issue has been reported in the ${extraction.repoName} project. The error logs point to something related to ${chapter.abstractionRef || chapter.title}. You need to quickly identify the root cause.`,
    options:
      fileList.length >= 3
        ? [
            {
              text: fileList[0].path,
              correct: true,
              explanation: `This is the primary implementation file for ${chapter.abstractionRef || chapter.title}. It contains the core logic and is the most likely source of bugs related to this component. Start here to understand the main code path.`,
            },
            {
              text: fileList[1].path,
              correct: false,
              explanation: `While this file is part of the ${chapter.abstractionRef || chapter.title} implementation, it handles supporting functionality. Check ${fileList[0].path} first for the core logic, then come here if the issue isn't in the main path.`,
            },
            {
              text: fileList[2].path,
              correct: false,
              explanation: `This file provides auxiliary support for ${chapter.abstractionRef || chapter.title}. It's less likely to be the root cause — start with the primary implementation file instead.`,
            },
            {
              text: "Check the test files first",
              correct: false,
              explanation: "Tests can help you understand expected behavior, but when debugging a production issue, start with the implementation files to trace the actual code path that's failing.",
            },
          ]
        : [
            {
              text: "Start with the primary implementation file for this component",
              correct: true,
              explanation: "The main implementation file shows the real control flow and data transformations. It's the most efficient starting point for debugging.",
            },
            {
              text: "Start with utility or helper files",
              correct: false,
              explanation: "Utilities are important but secondary. The core implementation file will show you the main execution path first.",
            },
            {
              text: "Start with configuration files",
              correct: false,
              explanation: "Configuration issues are possible but less common. The implementation file is a better starting point for most bugs.",
            },
          ],
  });

  blocks.push({
    type: "text",
    content: `### Summary\n\n${chapter.abstractionRef || chapter.title} is a fundamental part of the ${extraction.repoName} architecture. Understanding how it works — and how it connects to ${relatedRels.map(r => r.from === chapter.abstractionRef ? r.to : r.from).slice(0, 3).join(", ") || "the rest of the system"} — is essential for working effectively with this codebase.\n\nThe key files to study are: ${relatedFiles.slice(0, 3).map(f => `\`${f.path}\``).join(", ") || "the implementation files listed above"}.`,
  });

  return blocks;
}

export function safeParseYaml(raw: string): unknown {
  let cleaned = raw.trim().replace(/^\uFEFF/, "");

  const fenced = cleaned.match(/```(?:ya?ml|json)?\s*([\s\S]*?)\s*```/);
  if (fenced) cleaned = fenced[1].trim();

  const preYamlIdx = cleaned.search(/^-\s+\w+:/m);
  if (preYamlIdx > 0) {
    const before = cleaned.slice(0, preYamlIdx).trim();
    if (!before.includes(":") && !before.startsWith("[") && !before.startsWith("{")) {
      cleaned = cleaned.slice(preYamlIdx);
    }
  }

  const postYamlMatch = cleaned.match(/\n\n(?:Note|Explanation|Here|The above|I hope|Let me|Please)[^\n]*\n/i);
  if (postYamlMatch && postYamlMatch.index && postYamlMatch.index > cleaned.length * 0.3) {
    cleaned = cleaned.slice(0, postYamlMatch.index);
  }

  try {
    return YAML.parse(cleaned);
  } catch {}

  try {
    const fixedQuotes = cleaned.replace(
      /^(\s*-\s+\w+:\s+)([^"'\n][^\n]*[^"'\n])$/gm,
      (_, prefix: string, value: string) => {
        if (value.includes('"') || value.includes("'")) return `${prefix}"${value.replace(/"/g, '\\"')}"`;
        return `${prefix}"${value}"`;
      }
    );
    return YAML.parse(fixedQuotes);
  } catch {}

  try {
    const fixedIndent = cleaned.replace(/^\t/gm, "  ").replace(/^( {3})/gm, "  ");
    return YAML.parse(fixedIndent);
  } catch {}

  const jsonMatch = cleaned.match(/[{[][\s\S]*[\]}]/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }

  throw new Error("Failed to parse YAML from AI response");
}
