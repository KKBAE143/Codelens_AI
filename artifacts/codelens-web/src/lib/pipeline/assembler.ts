import type { RepoExtraction } from "../github";
import type { ChapterResult, Relationship, Abstraction, PipelineConfig } from "./types";
import { generateText } from "../llm";

interface ConceptIndexEntry {
  term: string;
  moduleIndices: number[];
  description: string;
}

const TECH_GLOSSARY: Array<{ match: string; display: string; description: string }> = [
  { match: "middleware", display: "Middleware", description: "Software that acts as a bridge between an application and other services or layers." },
  { match: "webhook", display: "Webhook", description: "An HTTP callback triggered by an event, pushing data to a specified URL in real time." },
  { match: "rest api", display: "REST API", description: "An architectural style for designing networked applications using stateless HTTP requests." },
  { match: "graphql", display: "GraphQL", description: "A query language and runtime for APIs that lets clients request exactly the data they need." },
  { match: "orm", display: "ORM", description: "Object-Relational Mapping — a technique for querying and manipulating data using an object-oriented paradigm." },
  { match: "migration", display: "Migration", description: "A versioned change to a database schema, applied and rolled back programmatically." },
  { match: "jwt", display: "JWT", description: "JSON Web Token — a compact, URL-safe token used for authentication and information exchange." },
  { match: "oauth", display: "OAuth", description: "An open authorization framework that lets third-party services access user data without exposing credentials." },
  { match: "cors", display: "CORS", description: "Cross-Origin Resource Sharing — a mechanism that allows restricted resources to be requested from another domain." },
  { match: "csrf", display: "CSRF", description: "Cross-Site Request Forgery — an attack that tricks users into performing unintended actions on authenticated sites." },
  { match: "ssr", display: "SSR", description: "Server-Side Rendering — generating HTML on the server before sending it to the client." },
  { match: "csr", display: "CSR", description: "Client-Side Rendering — rendering pages in the browser using JavaScript after the initial page load." },
  { match: "ci/cd", display: "CI/CD", description: "Continuous Integration / Continuous Deployment — automating build, test, and release pipelines." },
  { match: "docker", display: "Docker", description: "A platform for building, shipping, and running applications inside lightweight containers." },
  { match: "kubernetes", display: "Kubernetes", description: "An orchestration system for automating deployment, scaling, and management of containerized applications." },
  { match: "rate limiting", display: "Rate Limiting", description: "Controlling the number of requests a client can make to a service within a given time window." },
  { match: "caching", display: "Caching", description: "Storing copies of data in a fast-access layer to reduce latency and backend load." },
  { match: "redis", display: "Redis", description: "An in-memory data store used as a cache, message broker, and key-value database." },
  { match: "websocket", display: "WebSocket", description: "A protocol providing full-duplex communication channels over a single TCP connection." },
  { match: "pub/sub", display: "Pub/Sub", description: "Publish/Subscribe — a messaging pattern where senders publish messages to topics and receivers subscribe." },
  { match: "microservices", display: "Microservices", description: "An architecture where an application is composed of small, independently deployable services." },
  { match: "monorepo", display: "Monorepo", description: "A repository strategy where multiple projects or packages share one version-controlled codebase." },
  { match: "dependency injection", display: "Dependency Injection", description: "A design pattern where objects receive their dependencies from an external source rather than creating them." },
  { match: "singleton", display: "Singleton", description: "A design pattern that restricts a class to a single instance shared across the application." },
  { match: "event loop", display: "Event Loop", description: "A programming construct that waits for and dispatches events or messages in a program." },
  { match: "concurrency", display: "Concurrency", description: "The ability of a system to handle multiple tasks in overlapping time periods." },
  { match: "load balancer", display: "Load Balancer", description: "A device or service that distributes incoming network traffic across multiple servers." },
  { match: "reverse proxy", display: "Reverse Proxy", description: "A server that forwards client requests to backend servers and returns the response to the client." },
  { match: "environment variable", display: "Environment Variable", description: "A dynamic value set outside the code that configures application behavior at runtime." },
  { match: "idempotent", display: "Idempotent", description: "An operation that produces the same result no matter how many times it is executed." },
];

function buildConceptIndex(
  chapters: ChapterResult[],
  abstractions: Abstraction[],
): ConceptIndexEntry[] {
  const conceptMap = new Map<string, { indices: Set<number>; description: string; displayName?: string }>();

  for (const abs of abstractions) {
    conceptMap.set(abs.name.toLowerCase(), {
      indices: new Set<number>(),
      description: abs.description.slice(0, 120),
      displayName: abs.name,
    });
  }

  const capitalizedTermPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;

  for (const ch of chapters) {
    const chapterText = JSON.stringify(ch.blocks);
    const chapterTextLower = chapterText.toLowerCase();

    for (const abs of abstractions) {
      const key = abs.name.toLowerCase();
      if (chapterTextLower.includes(key)) {
        const entry = conceptMap.get(key);
        if (entry) entry.indices.add(ch.index);
      }
    }

    for (const entry of TECH_GLOSSARY) {
      if (chapterTextLower.includes(entry.match)) {
        const existing = conceptMap.get(entry.match);
        if (existing) {
          existing.indices.add(ch.index);
        } else {
          conceptMap.set(entry.match, {
            indices: new Set<number>([ch.index]),
            description: entry.description,
            displayName: entry.display,
          });
        }
      }
    }

    let match: RegExpExecArray | null;
    while ((match = capitalizedTermPattern.exec(chapterText)) !== null) {
      const rawTerm = match[1];
      const key = rawTerm.toLowerCase();
      if (conceptMap.has(key)) {
        conceptMap.get(key)!.indices.add(ch.index);
        continue;
      }
      if (key.split(/\s+/).length < 2 || key.length < 6) continue;
      const skipPrefixes = ["module ", "section ", "chapter ", "block ", "step ", "part ", "figure "];
      if (skipPrefixes.some((p) => key.startsWith(p))) continue;

      conceptMap.set(key, {
        indices: new Set<number>([ch.index]),
        description: `A key concept discussed in the codebase modules.`,
        displayName: rawTerm,
      });
    }
  }

  return Array.from(conceptMap.entries())
    .filter(([, v]) => v.indices.size > 0)
    .map(([key, v]) => ({
      term: v.displayName || key,
      moduleIndices: Array.from(v.indices).sort((a, b) => a - b),
      description: v.description,
    }))
    .sort((a, b) => a.term.localeCompare(b.term, undefined, { sensitivity: "base" }));
}

async function buildCodebasePassport(
  extraction: RepoExtraction,
  abstractions: Abstraction[],
  relationships: Relationship[],
  chapters: ChapterResult[],
  config: PipelineConfig,
): Promise<Record<string, unknown>> {
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

  const totalRelationships = relationships.length;
  const avgConnections = abstractions.length > 0
    ? totalRelationships / abstractions.length
    : 0;
  const fileCount = extraction.totalFilesCatalogued;
  const complexityLevel: "Beginner" | "Intermediate" | "Advanced" =
    fileCount <= 30 && avgConnections < 2 && abstractions.length <= 6 ? "Beginner"
    : fileCount <= 150 && avgConnections < 3.5 && abstractions.length <= 12 ? "Intermediate"
    : "Advanced";

  const archCardPatterns: string[] = [];
  for (const ch of chapters) {
    for (const block of ch.blocks as Array<Record<string, unknown>>) {
      if (block.type === "architecture-card" && typeof block.decision === "string") {
        const dec = (block.decision as string).toLowerCase();
        const archKeywords = ["middleware", "plugin", "hook", "event-driven", "observer", "factory", "singleton", "decorator", "adapter", "proxy", "mvc", "mvvm", "rest", "graphql", "pub/sub", "queue", "pipeline", "microservice", "monorepo", "layered"];
        for (const kw of archKeywords) {
          if (dec.includes(kw) && !archCardPatterns.includes(kw)) {
            archCardPatterns.push(kw);
          }
        }
      }
    }
  }
  const mainPatterns = archCardPatterns.slice(0, 5);

  const testFiles = extraction.fileTree?.filter((f: string) =>
    /\.(test|spec)\.(ts|js|tsx|jsx|py)$/.test(f) || f.includes("__tests__") || f.includes("test/")
  ) ?? [];
  const testPct = extraction.totalFilesCatalogued > 0
    ? Math.round((testFiles.length / extraction.totalFilesCatalogued) * 100)
    : 0;
  const testCoverageEstimate = `~${testPct}% files`;

  const langList = topLanguages.map((l) => l.language).join(", ");
  let personalitySummary: string;
  try {
    const summaryPrompt = `Summarize this codebase in exactly 3 sentences for a developer overview card. Be specific and concrete, not generic.\n\nFacts:\n- Repository: ${extraction.repoName} by ${extraction.owner}\n- Languages: ${langList}\n- ${fileCount} files, ${abstractions.length} core abstractions, ${totalRelationships} relationships\n- Complexity: ${complexityLevel}\n- Patterns detected: ${mainPatterns.length > 0 ? mainPatterns.join(", ") : "none"}\n- Test file ratio: ${testPct}%\n- Core components: ${mostConnected.map((c) => c.name).join(", ")}\n\nReturn exactly 3 sentences, no markdown, no bullets.`;
    const summaryRes = await generateText({
      task: "stage4",
      prompt: summaryPrompt,
      maxOutputTokens: 200,
    });
    personalitySummary = summaryRes.text.trim().replace(/\n+/g, " ");
  } catch {
    personalitySummary = `This is a ${complexityLevel.toLowerCase()}-level ${langList} project with ${abstractions.length} core abstractions and ${totalRelationships} relationships. ${mainPatterns.length > 0 ? `It uses ${mainPatterns.join(", ")} patterns. ` : ""}Test file coverage is approximately ${testPct}%.`;
  }

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
    complexityLevel,
    mainPatterns,
    testCoverageEstimate,
    personalitySummary,
  };
}

export async function assembleV2Course(
  chapters: ChapterResult[],
  extraction: RepoExtraction,
  relationships: Relationship[],
  abstractions: Abstraction[],
  config: PipelineConfig,
): Promise<string> {
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
  const codebasePassport = await buildCodebasePassport(extraction, abstractions, relationships, chapters, config);

  const modulesWithSummary = chapters.map((ch) => {
    const blocks = [...(ch.blocks as unknown[])];

    const lastBlock = blocks[blocks.length - 1];
    const hasEndSummary = lastBlock && typeof lastBlock === "object" &&
      (lastBlock as Record<string, unknown>).type === "text" &&
      typeof (lastBlock as Record<string, unknown>).content === "string" &&
      ((lastBlock as Record<string, unknown>).content as string).toLowerCase().includes("summary");

    if (!hasEndSummary && blocks.length >= 3) {
      const bullets: string[] = [];

      if (ch.learningObjective) {
        bullets.push(ch.learningObjective);
      }

      const matchedAbstraction = abstractions.find((a) =>
        ch.title.toLowerCase().includes(a.name.toLowerCase()) ||
        a.name.toLowerCase().includes(ch.title.toLowerCase().replace(/module \d+:\s*/i, ""))
      );
      if (matchedAbstraction) {
        bullets.push(`How **${matchedAbstraction.name}** works and its role in the codebase`);
      }

      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "quiz" && Array.isArray(b.options)) {
          const question = typeof b.question === "string" ? b.question : "";
          const terms = question.match(/`([^`]+)`/g);
          if (terms) {
            for (const t of terms) {
              const clean = t.replace(/`/g, "");
              if (!bullets.some((bul) => bul.toLowerCase().includes(clean.toLowerCase()))) {
                bullets.push(`The concept of **${clean}** and how it's used`);
                if (bullets.length >= 5) break;
              }
            }
          }
        }
        if (bullets.length >= 5) break;
      }

      if (bullets.length < 3) {
        for (const block of blocks) {
          if (!block || typeof block !== "object") continue;
          const b = block as Record<string, unknown>;
          if (b.type === "text" && typeof b.content === "string") {
            const headingMatch = (b.content as string).match(/<h[23][^>]*>([^<]+)<\/h[23]>/);
            if (headingMatch && !bullets.some((bul) => bul.toLowerCase().includes(headingMatch[1].toLowerCase()))) {
              bullets.push(`Understanding **${headingMatch[1]}**`);
              if (bullets.length >= 5) break;
            }
          }
        }
      }

      if (bullets.length < 5) {
        for (const block of blocks) {
          if (!block || typeof block !== "object") continue;
          const b = block as Record<string, unknown>;
          if (b.type === "code" && typeof b.content === "string") {
            const filename = typeof b.filePath === "string" ? b.filePath : (typeof b.file === "string" ? b.file : (typeof b.caption === "string" ? b.caption : ""));
            const lang = typeof b.language === "string" ? (b.language as string) : "";
            const baseName = filename ? filename.split("/").pop()! : "";
            if (baseName && !bullets.some((bul) => bul.toLowerCase().includes(baseName.toLowerCase()))) {
              bullets.push(`How **${baseName}** works${lang ? ` (${lang})` : ""}`);
              if (bullets.length >= 5) break;
            }
          }
          if (b.type === "exercise" && typeof b.title === "string") {
            const exTitle = b.title as string;
            if (!bullets.some((bul) => bul.toLowerCase().includes(exTitle.toLowerCase()))) {
              bullets.push(`Hands-on practice: **${exTitle}**`);
              if (bullets.length >= 5) break;
            }
          }
          if (b.type === "callout" && typeof b.content === "string") {
            const calloutTitle = typeof b.title === "string" ? (b.title as string) : "";
            if (calloutTitle && !bullets.some((bul) => bul.toLowerCase().includes(calloutTitle.toLowerCase()))) {
              bullets.push(`Key insight: **${calloutTitle}**`);
              if (bullets.length >= 5) break;
            }
            const boldMatch = (b.content as string).match(/\*\*([^*]{3,40})\*\*/);
            if (boldMatch && !bullets.some((bul) => bul.toLowerCase().includes(boldMatch[1].toLowerCase()))) {
              bullets.push(`Key insight: **${boldMatch[1]}**`);
              if (bullets.length >= 5) break;
            }
          }
        }
      }

      if (bullets.length < 3) {
        for (const block of blocks) {
          if (!block || typeof block !== "object") continue;
          const b = block as Record<string, unknown>;
          if (b.type === "text" && typeof b.content === "string") {
            const boldTerms = (b.content as string).match(/<strong>([^<]{3,40})<\/strong>/g);
            if (boldTerms) {
              for (const bt of boldTerms) {
                const term = bt.replace(/<\/?strong>/g, "");
                if (!bullets.some((bul) => bul.toLowerCase().includes(term.toLowerCase()))) {
                  bullets.push(`The role of **${term}** in this system`);
                  if (bullets.length >= 5) break;
                }
              }
            }
          }
          if (bullets.length >= 5) break;
        }
      }

      const cleanTitle = ch.title.replace(/module \d+:\s*/i, "").trim();
      if (bullets.length < 3 && cleanTitle) {
        const titleFallbacks = [
          `Core patterns and structures in **${cleanTitle}**`,
          `How **${cleanTitle}** connects to other parts of the codebase`,
          `Practical usage of **${cleanTitle}** in real scenarios`,
        ];
        for (const fb of titleFallbacks) {
          if (bullets.length >= 3) break;
          bullets.push(fb);
        }
      }

      const bulletList = bullets.slice(0, 5).map((b) => `- ${b}`).join("\n");
      blocks.push({
        type: "module-summary",
        title: "What You Learned",
        bullets: bullets.slice(0, 5),
        content: `**What You Learned**\n\n${bulletList}`,
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
