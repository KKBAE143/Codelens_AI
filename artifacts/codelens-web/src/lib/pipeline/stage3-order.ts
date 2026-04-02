import { generateText } from "../llm";
import type { PipelineEmitter } from "./events";
import { getChapterOrderPrompt } from "./prompts";
import { safeParseYaml } from "./helpers";
import type { Abstraction, Relationship, OrderedChapter, PipelineConfig } from "./types";

export async function runStage3Order(
  abstractions: Abstraction[],
  relationships: Relationship[],
  config: PipelineConfig,
  emitter: PipelineEmitter,
): Promise<OrderedChapter[]> {
  emitter.emitStageStart(
    "order_chapters",
    "Determining optimal learning order...",
    2,
    5,
  );

  const prompt = getChapterOrderPrompt(
    config.audience,
    config.depth,
    config.focusAreas,
  );

  const abstractionList = abstractions
    .map((a, i) => `${i + 1}. ${a.name}: ${a.description.slice(0, 150)}`)
    .join("\n");

  const relationshipList = relationships
    .map((r) => `${r.from} --[${r.relation}]--> ${r.to}: ${r.description}`)
    .join("\n");

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

      orderedChapters = parsed
        .map((item: Record<string, unknown>, idx: number) => ({
          index: Number(item.index) || idx + 2,
          title: String(item.title || ""),
          learningObjective: String(
            item.learningObjective || item.learning_objective || "",
          ),
          estimatedMinutes: Number(
            item.estimatedMinutes || item.estimated_minutes || 8,
          ),
          abstractionRef: String(
            item.abstractionRef || item.abstraction_ref || "",
          ),
          focusAreas: Array.isArray(item.focusAreas || item.focus_areas)
            ? ((item.focusAreas || item.focus_areas) as string[])
            : [],
          chapterType: "abstraction" as const,
        }))
        .filter((c) => c.title);

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
    {
      index: 0,
      title: "Overview & Architecture",
      learningObjective: "Understand the big picture",
      estimatedMinutes: 5,
      chapterType: "overview",
    },
    {
      index: 1,
      title: "Setup & Installation",
      learningObjective: "Get the project running locally",
      estimatedMinutes: 10,
      chapterType: "setup",
    },
    ...orderedChapters.map((c, i) => ({ ...c, index: i + 2 })),
    {
      index: orderedChapters.length + 2,
      title: "Dependencies Explained",
      learningObjective: "Understand every dependency",
      estimatedMinutes: 8,
      chapterType: "dependencies",
    },
    {
      index: orderedChapters.length + 3,
      title: "Troubleshooting & Common Errors",
      learningObjective: "Know how to debug common issues",
      estimatedMinutes: 10,
      chapterType: "troubleshooting",
    },
  ];

  emitter.emitStageComplete(
    "order_chapters",
    `Ordered ${fullChapters.length} chapters`,
    3,
    5,
  );

  return fullChapters;
}
