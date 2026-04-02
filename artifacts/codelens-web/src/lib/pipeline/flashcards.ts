import { generateText } from "../llm";
import type { TargetAudience } from "../prompts";
import { getFlashcardPrompt } from "./prompts";
import { safeParseJson } from "../utils/safe-json-parse";
import type { ChapterResult } from "./types";

interface GeneratedFlashcard {
  moduleIndex: number;
  front: string;
  back: string;
  codeSnippet: string | null;
}

function extractChapterText(blocks: unknown[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.content === "string") {
      const stripped = b.content.replace(/<[^>]+>/g, " ").trim();
      if (stripped) parts.push(stripped.slice(0, 800));
    } else if (b.type === "code" && typeof b.content === "string") {
      parts.push(`Code (${b.filePath || "unknown"}):\n${b.content.slice(0, 400)}`);
      if (typeof b.caption === "string") parts.push(`Caption: ${b.caption}`);
    } else if (b.type === "callout" && typeof b.content === "string") {
      parts.push(`Note: ${b.content.slice(0, 300)}`);
    } else if (b.type === "architecture-card") {
      const card = b as { decision?: string; rationale?: string };
      if (card.decision) parts.push(`Architecture decision: ${card.decision}`);
      if (card.rationale) parts.push(`Rationale: ${card.rationale}`);
    } else if (b.type === "quiz") {
      const q = b as { question?: string };
      if (q.question) parts.push(`Quiz question: ${q.question}`);
    }
  }
  return parts.slice(0, 20).join("\n\n");
}

export async function generateFlashcardsForChapters(
  chapters: ChapterResult[],
  _courseId: string,
  audience: TargetAudience,
): Promise<GeneratedFlashcard[]> {
  const prompt = getFlashcardPrompt(audience);
  const allCards: GeneratedFlashcard[] = [];

  const batches: Array<{ chapter: ChapterResult; content: string }> = [];
  for (const chapter of chapters) {
    const content = extractChapterText(chapter.blocks as unknown[]);
    if (!content || content.length < 100) continue;
    batches.push({ chapter, content });
  }

  await Promise.all(
    batches.map(async ({ chapter, content }) => {
      try {
        const chapterContext = `Chapter title: ${chapter.title}\n${chapter.learningObjective ? `Learning objective: ${chapter.learningObjective}\n` : ""}\n${content}`;
        const response = await generateText({
          task: "stage3",
          prompt: `${prompt}\n\nChapter content:\n${chapterContext}`,
          responseMimeType: "application/json",
          maxOutputTokens: 2048,
        });

        const parsed = safeParseJson(response.text) as Record<string, unknown>;
        const rawCards = Array.isArray(parsed.cards) ? parsed.cards : [];

        const validCardsForModule: GeneratedFlashcard[] = [];
        for (const rawCard of rawCards) {
          if (!rawCard || typeof rawCard !== "object") continue;
          const c = rawCard as Record<string, unknown>;
          const front = String(c.front || "").trim();
          const back = String(c.back || "").trim();
          if (!front || !back || front.length < 10 || back.length < 20) continue;
          const codeSnippet = typeof c.codeSnippet === "string" && c.codeSnippet.trim()
            ? c.codeSnippet.trim().slice(0, 600)
            : null;
          validCardsForModule.push({ moduleIndex: chapter.index, front, back, codeSnippet });
          if (validCardsForModule.length >= 5) break;
        }

        if (validCardsForModule.length < 3) {
          console.warn(`[Flashcards] Module ${chapter.index} (${chapter.title}) produced only ${validCardsForModule.length}/3 required cards — skipping module`);
        } else {
          allCards.push(...validCardsForModule);
        }
      } catch (err) {
        console.warn(`[Flashcards] Generation failed for module ${chapter.index} (${chapter.title}):`, err);
      }
    })
  );

  return allCards;
}
