import type { RepoExtraction } from "../github";
import type { ChapterResult, Relationship, Abstraction, PipelineConfig } from "./types";

interface ConceptIndexEntry {
  term: string;
  moduleIndices: number[];
  description: string;
}

const TECH_GLOSSARY: Record<string, string> = {
  "middleware": "Software that acts as a bridge between an application and other services or layers.",
  "webhook": "An HTTP callback triggered by an event, pushing data to a specified URL in real time.",
  "rest api": "An architectural style for designing networked applications using stateless HTTP requests.",
  "graphql": "A query language and runtime for APIs that lets clients request exactly the data they need.",
  "orm": "Object-Relational Mapping — a technique for querying and manipulating data using an object-oriented paradigm.",
  "migration": "A versioned change to a database schema, applied and rolled back programmatically.",
  "jwt": "JSON Web Token — a compact, URL-safe token used for authentication and information exchange.",
  "oauth": "An open authorization framework that lets third-party services access user data without exposing credentials.",
  "cors": "Cross-Origin Resource Sharing — a mechanism that allows restricted resources to be requested from another domain.",
  "csrf": "Cross-Site Request Forgery — an attack that tricks users into performing unintended actions on authenticated sites.",
  "ssr": "Server-Side Rendering — generating HTML on the server before sending it to the client.",
  "csr": "Client-Side Rendering — rendering pages in the browser using JavaScript after the initial page load.",
  "ci/cd": "Continuous Integration / Continuous Deployment — automating build, test, and release pipelines.",
  "docker": "A platform for building, shipping, and running applications inside lightweight containers.",
  "kubernetes": "An orchestration system for automating deployment, scaling, and management of containerized applications.",
  "rate limiting": "Controlling the number of requests a client can make to a service within a given time window.",
  "caching": "Storing copies of data in a fast-access layer to reduce latency and backend load.",
  "redis": "An in-memory data store used as a cache, message broker, and key-value database.",
  "websocket": "A protocol providing full-duplex communication channels over a single TCP connection.",
  "pub/sub": "Publish/Subscribe — a messaging pattern where senders publish messages to topics and receivers subscribe.",
  "microservices": "An architecture where an application is composed of small, independently deployable services.",
  "monorepo": "A repository strategy where multiple projects or packages share one version-controlled codebase.",
  "dependency injection": "A design pattern where objects receive their dependencies from an external source rather than creating them.",
  "singleton": "A design pattern that restricts a class to a single instance shared across the application.",
  "event loop": "A programming construct that waits for and dispatches events or messages in a program.",
  "concurrency": "The ability of a system to handle multiple tasks in overlapping time periods.",
  "load balancer": "A device or service that distributes incoming network traffic across multiple servers.",
  "reverse proxy": "A server that forwards client requests to backend servers and returns the response to the client.",
  "environment variable": "A dynamic value set outside the code that configures application behavior at runtime.",
  "idempotent": "An operation that produces the same result no matter how many times it is executed.",
};

function buildConceptIndex(
  chapters: ChapterResult[],
  abstractions: Abstraction[],
): ConceptIndexEntry[] {
  const conceptMap = new Map<string, { indices: Set<number>; description: string }>();

  for (const abs of abstractions) {
    conceptMap.set(abs.name.toLowerCase(), {
      indices: new Set<number>(),
      description: abs.description.slice(0, 120),
    });
  }

  for (const ch of chapters) {
    const chapterText = JSON.stringify(ch.blocks).toLowerCase();
    for (const abs of abstractions) {
      const key = abs.name.toLowerCase();
      if (chapterText.includes(key)) {
        const entry = conceptMap.get(key);
        if (entry) entry.indices.add(ch.index);
      }
    }

    for (const [term, desc] of Object.entries(TECH_GLOSSARY)) {
      if (conceptMap.has(term)) continue;
      if (chapterText.includes(term)) {
        const existing = conceptMap.get(term);
        if (existing) {
          existing.indices.add(ch.index);
        } else {
          conceptMap.set(term, {
            indices: new Set<number>([ch.index]),
            description: desc,
          });
        }
      }
    }
  }

  return Array.from(conceptMap.entries())
    .filter(([, v]) => v.indices.size > 0)
    .map(([term, v]) => ({
      term,
      moduleIndices: Array.from(v.indices).sort((a, b) => a - b),
      description: v.description,
    }))
    .sort((a, b) => a.term.localeCompare(b.term));
}

function buildCodebasePassport(
  extraction: RepoExtraction,
  abstractions: Abstraction[],
  relationships: Relationship[],
  chapters: ChapterResult[],
  config: PipelineConfig,
): Record<string, unknown> {
  const topLanguages = Object.entries(extraction.languageBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([lang, count]) => ({ language: lang, fileCount: count }));

  const totalMinutes = chapters.reduce((sum, c) => sum + (c.estimatedMinutes || 8), 0);

  const mostConnected = abstractions
    .map((a) => ({
      name: a.name,
      connections: relationships.filter((r) => r.from === a.name || r.to === a.name).length,
    }))
    .sort((a, b) => b.connections - a.connections)
    .slice(0, 3);

  return {
    repoName: extraction.repoName,
    owner: extraction.owner,
    totalFiles: extraction.totalFilesCatalogued,
    filesAnalyzed: extraction.filesIncludedFull,
    topLanguages,
    abstractionCount: abstractions.length,
    relationshipCount: relationships.length,
    moduleCount: chapters.length,
    estimatedMinutes: totalMinutes,
    persona: config.audience,
    depth: config.depth,
    coreComponents: mostConnected,
  };
}

export function assembleV2Course(
  chapters: ChapterResult[],
  extraction: RepoExtraction,
  relationships: Relationship[],
  abstractions: Abstraction[],
  config: PipelineConfig,
): string {
  const abstractionModuleIndex = new Map(
    chapters
      .filter((chapter) => chapter.abstractionRef)
      .map((chapter) => [chapter.abstractionRef as string, chapter.index]),
  );

  const overviewGraph = {
    nodes: abstractions.map((a, i) => ({
      id: a.name.toLowerCase().replace(/\s+/g, "-"),
      label: a.name,
      moduleIndex: abstractionModuleIndex.get(a.name) ?? i + 2,
      connections: relationships.filter(
        (r) => r.from === a.name || r.to === a.name,
      ).length,
      description: a.description,
      fileCount: a.file_paths?.length ?? a.file_indices.length,
    })),
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

  const conceptIndex = buildConceptIndex(chapters, abstractions);
  const codebasePassport = buildCodebasePassport(extraction, abstractions, relationships, chapters, config);

  const modulesWithSummary = chapters.map((ch) => {
    const blocks = [...(ch.blocks as unknown[])];

    const lastBlock = blocks[blocks.length - 1];
    const hasEndSummary = lastBlock && typeof lastBlock === "object" &&
      (lastBlock as Record<string, unknown>).type === "text" &&
      typeof (lastBlock as Record<string, unknown>).content === "string" &&
      ((lastBlock as Record<string, unknown>).content as string).toLowerCase().includes("summary");

    if (!hasEndSummary && blocks.length >= 3) {
      const keyTopics: string[] = [];
      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.content === "string") {
          const headingMatch = (b.content as string).match(/<h[23][^>]*>([^<]+)<\/h[23]>/);
          if (headingMatch) keyTopics.push(headingMatch[1]);
        }
      }
      const topicList = keyTopics.slice(0, 4).map((t) => `**${t}**`).join(", ");
      blocks.push({
        type: "callout",
        variant: "tip",
        content: `**Module Summary:** This module covered ${topicList || ch.title}. ${ch.learningObjective ? `Key takeaway: ${ch.learningObjective}.` : ""}`,
      });
    }

    return {
      index: ch.index,
      title: ch.title,
      learningObjective: ch.learningObjective,
      estimatedMinutes: ch.estimatedMinutes,
      focusAreas: ch.focusAreas,
      blocks,
    };
  });

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
    conceptIndex,
    codebasePassport,
    modules: modulesWithSummary,
  };

  return `__codelens_v2__${JSON.stringify(courseData)}`;
}
