import { generateText } from "../llm";
import { countTokens } from "../token-counter";
import type { PipelineEmitter } from "./events";
import { getRelationshipPrompt } from "./prompts";
import { safeParseYaml } from "./helpers";
import type { Abstraction, Relationship, PipelineConfig } from "./types";
import type { RepoExtraction } from "../github";

export async function runStage2Relationships(
  abstractions: Abstraction[],
  extraction: RepoExtraction,
  config: PipelineConfig,
  emitter: PipelineEmitter,
): Promise<Relationship[]> {
  emitter.emitStageStart(
    "analyze_relationships",
    "Analyzing relationships between abstractions...",
    1,
    5,
  );

  const prompt = getRelationshipPrompt(config.audience);

  const abstractionContext = abstractions
    .map((a, i) => {
      const fileExcerpts = a.file_indices
        .filter((idx) => idx < extraction.files.length)
        .map((idx) => {
          const f = extraction.files[idx];
          const lines = f.content.split("\n").slice(0, 50).join("\n");
          return `File: ${f.path}\n${lines}`;
        })
        .join("\n\n");

      return `Abstraction ${i + 1}: ${a.name}\n${a.description}\n\nKey files:\n${fileExcerpts}`;
    })
    .join("\n\n---\n\n");

  let contextStr = `${prompt}\n\n${abstractionContext}`;
  const tokens = countTokens(contextStr);
  if (tokens > 60000) {
    const abstractionSummary = abstractions
      .map(
        (a, i) =>
          `${i + 1}. ${a.name}: ${a.description.slice(0, 200)}\nFiles: ${a.file_indices.map((idx) => extraction.files[idx]?.path || `file_${idx}`).join(", ")}`,
      )
      .join("\n\n");
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

      relationships = parsed
        .map((item: Record<string, unknown>) => ({
          from: String(item.from || ""),
          to: String(item.to || ""),
          relation: String(item.relation || "calls"),
          description: String(item.description || ""),
        }))
        .filter((r) => r.from && r.to);

      break;
    } catch (error) {
      if (attempt === 3) {
        console.warn(
          "[Pipeline][Stage2] Failed after 3 attempts, proceeding with empty relationships",
        );
      }
    }
  }

  emitter.emitStageComplete(
    "analyze_relationships",
    `Found ${relationships.length} relationships`,
    2,
    5,
  );

  return relationships;
}
