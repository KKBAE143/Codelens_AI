import type { RepoExtraction } from "../github";
import type { ChapterResult, Relationship, Abstraction, PipelineConfig } from "./types";

export function assembleV2Course(
  chapters: ChapterResult[],
  extraction: RepoExtraction,
  relationships: Relationship[],
  abstractions: Abstraction[],
  config: PipelineConfig,
): string {
  const overviewGraph = {
    nodes: abstractions.map((a, i) => {
      let chapterIdx = chapters.findIndex(
        (c) => c.abstractionRef === a.name || c.title === a.name
      );
      if (chapterIdx === -1) {
        chapterIdx = i + 2; // Fallback if not found
      }
      return {
        id: a.name.toLowerCase().replace(/\s+/g, "-"),
        label: a.name,
        moduleIndex: chapterIdx,
        connections: relationships.filter(
          (r) => r.from === a.name || r.to === a.name,
        ).length,
      };
    }),
    edges: relationships.map((r) => ({
      from: r.from.toLowerCase().replace(/\s+/g, "-"),
      to: r.to.toLowerCase().replace(/\s+/g, "-"),
      relation: r.relation,
      label: r.description.slice(0, 50),
    })),
  };

  const totalMinutes = chapters.reduce(
    (sum, c) => sum + (c.estimatedMinutes || 8),
    0,
  );

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
    modules: chapters.map((ch) => ({
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
