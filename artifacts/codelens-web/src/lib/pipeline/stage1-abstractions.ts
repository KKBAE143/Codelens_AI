import { generateText } from "../llm";
import { countTokens } from "../token-counter";
import type { RepoExtraction } from "../github";
import type { PipelineEmitter } from "./events";
import { getAbstractionPrompt } from "./prompts";
import { safeParseYaml } from "./helpers";
import type { Abstraction, PipelineConfig } from "./types";

export async function runStage1Abstractions(
  extraction: RepoExtraction,
  config: PipelineConfig,
  emitter: PipelineEmitter,
): Promise<Abstraction[]> {
  emitter.emitStageStart(
    "identify_abstractions",
    "Identifying core abstractions...",
    0,
    5,
  );

  const prompt = getAbstractionPrompt(
    config.audience,
    config.depth,
    config.customContext,
  );
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

      abstractions = parsed
        .map((item: Record<string, unknown>) => {
          const indices = Array.isArray(item.file_indices)
            ? item.file_indices.map(Number).filter((n) => !isNaN(n))
            : [];
          const paths = indices
            .filter((idx) => idx < extraction.files.length)
            .map((idx) => extraction.files[idx].path);
          return {
            name: String(item.name || ""),
            description: String(item.description || ""),
            file_indices: indices,
            file_paths: paths,
          };
        })
        .filter((a) => a.name && a.description);

      if (abstractions.length < 3) {
        lastError = `Only ${abstractions.length} abstractions found, expected at least 3`;
        continue;
      }

      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown error";
      if (attempt === 3)
        throw new Error(`Stage 1 failed after 3 attempts: ${lastError}`);
    }
  }

  for (let i = 0; i < abstractions.length; i++) {
    emitter.emitAbstractionIdentified(
      abstractions[i].name,
      i + 1,
      abstractions.length,
    );
  }

  emitter.emitStageComplete(
    "identify_abstractions",
    `Identified ${abstractions.length} abstractions`,
    1,
    5,
    abstractions.map((a) => a.name),
  );

  return abstractions;
}
