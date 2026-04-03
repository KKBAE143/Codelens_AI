import { generateText, getAccountsForStage, getHealthyAccountCount, sleep, type LlmTask } from "../llm";
import { countTokens, truncateAtFunctionBoundary, getDepthTokenBudget, getDepthContextBudget } from "../token-counter";
import { v2ChapterSchema } from "../v2-schema";
import { type RepoExtraction, fetchFileContent } from "../github";
import type { PipelineEmitter } from "./events";
import {
  getChapterWritePrompt,
  getSetupChapterPrompt,
  getDependenciesChapterPrompt,
  getTroubleshootingChapterPrompt,
  getOverviewChapterPrompt,
} from "./prompts";
import { computePageRank } from "../repo-map";
import { safeParseJson } from "../utils/safe-json-parse";
import { normalizeBlock, buildFallbackBlocks } from "./helpers";
import type { Abstraction, Relationship, OrderedChapter, ChapterResult, PipelineConfig } from "./types";

type FileEntry = { path: string; content: string; size: number };

async function getAbstractionFilesByPageRank(
  abstraction: Abstraction,
  extraction: RepoExtraction,
): Promise<{ mapped: FileEntry[]; supplemental: FileEntry[] }> {
  const allFetched = extraction.allFetchedFiles || [];
  const allFetchedByPath = new Map(allFetched.map(f => [f.path, f]));

  const mappedPaths = abstraction.file_paths && abstraction.file_paths.length > 0
    ? abstraction.file_paths
    : abstraction.file_indices
        .filter((idx) => idx < extraction.files.length)
        .map((idx) => extraction.files[idx].path);

  const includedPaths = new Set<string>();
  const mapped: FileEntry[] = [];
  const missingPaths: string[] = [];

  for (const path of mappedPaths) {
    if (includedPaths.has(path)) continue;
    const fromAll = allFetchedByPath.get(path);
    if (fromAll) {
      mapped.push(fromAll);
      includedPaths.add(path);
    } else {
      const fromTop = extraction.files.find(f => f.path === path);
      if (fromTop) {
        mapped.push(fromTop);
        includedPaths.add(path);
      } else {
        missingPaths.push(path);
      }
    }
  }

  if (missingPaths.length > 0 && extraction.owner && extraction.repoName) {
    const fetched = await Promise.allSettled(
      missingPaths.map(p =>
        fetchFileContent(extraction.owner, extraction.repoName, p, extraction.defaultBranch)
      )
    );
    for (const r of fetched) {
      if (r.status === "fulfilled" && r.value && !includedPaths.has(r.value.path)) {
        mapped.push(r.value);
        includedPaths.add(r.value.path);
      }
    }
  }

  const supplemental: FileEntry[] = [];
  const abstractionDirs = new Set<string>();
  for (const path of mappedPaths) {
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (dir) abstractionDirs.add(dir);
  }
  for (const f of allFetched) {
    if (includedPaths.has(f.path)) continue;
    const fDir = f.path.substring(0, f.path.lastIndexOf("/"));
    if (fDir && abstractionDirs.has(fDir)) {
      supplemental.push(f);
      includedPaths.add(f.path);
    }
  }

  if (supplemental.length > 1) {
    const allFiles = [...mapped, ...supplemental];
    const pageRank = computePageRank(allFiles);
    supplemental.sort((a, b) => {
      const scoreA = pageRank.scores.get(a.path) || 0;
      const scoreB = pageRank.scores.get(b.path) || 0;
      return scoreB - scoreA;
    });
  }

  return { mapped, supplemental };
}

function buildCrossAbstractionContext(
  currentAbstraction: string,
  abstractions: Abstraction[],
  relationships: Relationship[],
): string {
  const related = relationships.filter(
    (r) => r.from === currentAbstraction || r.to === currentAbstraction,
  );

  if (related.length === 0) return "";

  const relatedNames = new Set<string>();
  for (const r of related) {
    if (r.from !== currentAbstraction) relatedNames.add(r.from);
    if (r.to !== currentAbstraction) relatedNames.add(r.to);
  }

  const summaries = abstractions
    .filter((a) => relatedNames.has(a.name))
    .map((a) => `**${a.name}**: ${a.description.slice(0, 200)}`)
    .slice(0, 5);

  if (summaries.length === 0) return "";

  return `\n\nRelated abstractions the reader already knows about:\n${summaries.join("\n")}`;
}

function packAbstractionContextWithMapped(
  mapped: FileEntry[],
  supplemental: FileEntry[],
  contextBudget: number,
): string {
  const allFiles = [...mapped, ...supplemental];
  const fileTree = allFiles.map((f) => {
    const lines = f.content.split("\n").length;
    return `  ${f.path} (${lines} lines)`;
  }).join("\n");
  const treeSummary = `=== File Tree (${allFiles.length} files, ${mapped.length} mapped + ${supplemental.length} supplemental) ===\n${fileTree}\n`;
  const treeSummaryTokens = countTokens(treeSummary);

  const parts: string[] = [treeSummary];
  let tokensSoFar = treeSummaryTokens;

  for (const f of mapped) {
    const header = `\n=== File (mapped): ${f.path} ===\n`;
    const headerTokens = countTokens(header);
    const blockTokens = countTokens(f.content);
    parts.push(`${header}${f.content}`);
    tokensSoFar += headerTokens + blockTokens;
  }

  for (const f of supplemental) {
    const header = `\n=== File: ${f.path} ===\n`;
    const headerTokens = countTokens(header);
    const remaining = contextBudget - tokensSoFar - headerTokens;
    if (remaining <= 100) break;

    const truncated = truncateAtFunctionBoundary(f.content, remaining);
    const blockTokens = countTokens(truncated);

    parts.push(`${header}${truncated}`);
    tokensSoFar += headerTokens + blockTokens;
  }

  return parts.join("\n");
}

const JARGON_GLOSSARY: Record<string, string> = {
  "middleware": "A function that sits between the request and the response, processing or transforming data as it passes through.",
  "ORM": "Object-Relational Mapping — a tool that lets you interact with your database using your programming language instead of writing raw SQL.",
  "SSR": "Server-Side Rendering — the server generates the full HTML page before sending it to the browser.",
  "SSG": "Static Site Generation — pages are pre-built at deploy time, so they load instantly without a server.",
  "CSR": "Client-Side Rendering — the browser downloads JavaScript and builds the page locally.",
  "hydration": "The process where the browser takes server-rendered HTML and attaches JavaScript event handlers to make it interactive.",
  "tree-shaking": "A build optimization that removes unused code from your final bundle to keep it small.",
  "hot module replacement": "A development feature that updates changed code in the browser without a full page reload.",
  "HMR": "Hot Module Replacement — updates changed code in the browser without a full page reload.",
  "webhook": "An HTTP callback that sends data to your app automatically when an event happens in another service.",
  "JWT": "JSON Web Token — a compact, self-contained token used to securely transmit authentication information.",
  "CORS": "Cross-Origin Resource Sharing — a security mechanism that controls which websites can make requests to your server.",
  "API gateway": "A single entry point that routes, rate-limits, and authenticates all incoming API requests.",
  "pub/sub": "Publish/Subscribe — a messaging pattern where senders broadcast messages without knowing who receives them.",
  "race condition": "A bug that happens when two operations run at the same time and the result depends on which one finishes first.",
  "deadlock": "A situation where two processes each wait for the other to release a resource, so neither can proceed.",
  "idempotent": "An operation that produces the same result no matter how many times you run it.",
  "singleton": "A design pattern that ensures only one instance of a class exists throughout the application.",
  "dependency injection": "A pattern where objects receive their dependencies from outside rather than creating them internally.",
  "memoization": "Caching the result of an expensive function call so repeated calls with the same arguments return instantly.",
  "debounce": "Delaying execution of a function until a pause in rapid-fire calls (e.g., waiting until the user stops typing).",
  "throttle": "Limiting how often a function can run (e.g., at most once every 200ms).",
  "serialization": "Converting an in-memory object into a string or byte format so it can be stored or sent over a network.",
  "deserialization": "Converting a stored string or byte format back into an in-memory object.",
  "polymorphism": "The ability of different types to respond to the same method call in their own way.",
  "abstraction": "Hiding complex implementation details behind a simpler interface.",
  "encapsulation": "Bundling data and the methods that operate on it together, restricting direct access to internals.",
  "mutex": "A lock that ensures only one thread or process can access a shared resource at a time.",
  "CI/CD": "Continuous Integration / Continuous Deployment — automated pipelines that test and deploy your code on every commit.",
  "container": "A lightweight, isolated environment (like Docker) that packages an app with everything it needs to run.",
  "orchestration": "Automating the deployment, scaling, and management of multiple containers or services.",
  "sharding": "Splitting a database across multiple servers so each one handles a subset of the data.",
  "replication": "Copying data across multiple database servers for redundancy and faster reads.",
  "caching": "Storing frequently accessed data in fast storage (like RAM) to avoid repeated slow lookups.",
  "load balancer": "A system that distributes incoming traffic across multiple servers to prevent overload.",
  "monorepo": "A single repository that contains multiple projects or packages, managed together.",
  "microservice": "A small, independently deployable service that handles one specific business function.",
  "event loop": "The mechanism in Node.js (and browsers) that handles asynchronous operations by processing a queue of callbacks.",
  "closure": "A function that remembers variables from the scope where it was created, even after that scope has ended.",
  "currying": "Transforming a function with multiple arguments into a chain of functions, each taking one argument.",
  "decorator": "A pattern (or syntax) that wraps a function or class to extend its behavior without modifying its code.",
  "GraphQL": "A query language for APIs that lets clients request exactly the data they need, nothing more.",
  "REST": "Representational State Transfer — an API style using standard HTTP methods (GET, POST, PUT, DELETE) on resources.",
  "gRPC": "A high-performance RPC framework that uses Protocol Buffers for efficient binary serialization.",
  "protocol buffer": "A language-neutral binary format for serializing structured data, used by gRPC.",
  "message queue": "A system (like RabbitMQ or SQS) that stores messages between services so they can communicate asynchronously.",
  "saga pattern": "A way to manage distributed transactions by breaking them into a sequence of local transactions with compensating actions.",
  "CQRS": "Command Query Responsibility Segregation — using separate models for reading and writing data.",
  "eventual consistency": "A model where data across distributed systems will become consistent given enough time, but may be temporarily out of sync.",
};

function extractTextFromBlock(block: Record<string, unknown>): string {
  const type = block.type as string;
  if (type === "text") return String(block.content ?? "").replace(/<[^>]+>/g, " ");
  if (type === "code") return `${block.caption ?? ""} ${block.content ?? ""}`;
  if (type === "callout") return String(block.content ?? "");
  return "";
}

function injectJargonCallouts(blocks: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seenTerms = new Set<string>();
  const result: Array<Record<string, unknown>> = [];

  for (const block of blocks) {
    result.push(block);

    if (block.type === "callout" && String(block.variant ?? "") === "jargon") continue;

    const text = extractTextFromBlock(block).toLowerCase();
    if (!text) continue;

    const matchedTerms: Array<{ term: string; definition: string }> = [];

    for (const [term, definition] of Object.entries(JARGON_GLOSSARY)) {
      const lowerTerm = term.toLowerCase();
      if (seenTerms.has(lowerTerm)) continue;

      const escaped = lowerTerm.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      if (regex.test(text)) {
        seenTerms.add(lowerTerm);
        matchedTerms.push({ term, definition });
      }
    }

    if (matchedTerms.length > 0) {
      const glossaryContent = matchedTerms
        .map((m) => `**${m.term}**: ${m.definition}`)
        .join("\n\n");

      result.push({
        type: "callout",
        variant: "info",
        content: `📖 **Jargon Buster**\n\n${glossaryContent}`,
      });
    }
  }

  return result;
}

function getProgressiveBlockRequirements(attempt: number, depth: "quick" | "full" | "deep"): string {
  if (attempt === 1) return "";

  if (attempt === 2) {
    return `\n\nSIMPLIFIED REQUIREMENTS (retry — use fewer block types for reliability):
- Reduce block count: aim for ${depth === "quick" ? "4-6" : depth === "full" ? "6-8" : "8-12"} blocks
- Mermaid diagram is OPTIONAL — skip if complex
- Quiz can have 2 options instead of 3-4
- Code blocks: include 1-2 key excerpts instead of 2-4
- Prioritize text explanations and code examples over diagrams`;
  }

  return `\n\nMINIMAL REQUIREMENTS (attempt ${attempt}):
- Write 3-5 blocks only
- 1 text block explaining the abstraction
- 1 code block with the most important function
- 1 callout with a key insight
- Skip mermaid, quiz, file-list if they cause issues`;
}

async function writeOneChapter(
  chapter: OrderedChapter,
  abstractions: Abstraction[],
  relationships: Relationship[],
  extraction: RepoExtraction,
  config: PipelineConfig,
  emitter: PipelineEmitter,
  totalChapters: number,
  accountLabel?: string,
): Promise<ChapterResult> {
  emitter.emitChapterStart(chapter.index, chapter.title, totalChapters);

  const outputTokenBudget = getDepthTokenBudget(config.depth);
  const contextBudget = getDepthContextBudget(config.depth);

  let prompt: string;
  let contextData: string;

  if (chapter.chapterType === "overview") {
    prompt = getOverviewChapterPrompt(config.audience);
    const relGraph = relationships
      .map((r) => `${r.from} -> ${r.to} (${r.relation})`)
      .join("\n");
    contextData = `Repository: ${extraction.repoName}\nOwner: ${extraction.owner}\nFiles: ${extraction.totalFilesCatalogued}\nLanguages: ${Object.entries(
      extraction.languageBreakdown,
    )
      .map(([l, c]) => `${l}: ${c}`)
      .join(
        ", ",
      )}\n\nAbstractions:\n${abstractions.map((a) => `- ${a.name}: ${a.description}`).join("\n")}\n\nRelationship graph:\n${relGraph}`;
  } else if (chapter.chapterType === "setup") {
    prompt = getSetupChapterPrompt(config.audience);
    const pkgData = extraction.parsedPackageJson
      ? `Package.json:\nDependencies: ${extraction.parsedPackageJson.dependencies.map((d) => `${d.name}@${d.version}`).join(", ")}\nScripts: ${JSON.stringify(extraction.parsedPackageJson.scripts)}`
      : "No package.json found";
    const envData = extraction.parsedEnvExample
      ? `Environment variables:\n${extraction.parsedEnvExample.map((v) => `${v.key}=${v.value} ${v.comment ? `# ${v.comment}` : ""}`).join("\n")}`
      : "No .env.example found";
    const dockerData = extraction.parsedDockerfile
      ? `Dockerfile:\nBase: ${extraction.parsedDockerfile.baseImage}\nPorts: ${extraction.parsedDockerfile.exposePorts.join(", ")}\nCommands: ${extraction.parsedDockerfile.keyCommands.join("; ")}`
      : "No Dockerfile found";
    const manifestsData = extraction.parsedSetupManifests.length > 0
      ? `\n\nDetected package manifests:\n${extraction.parsedSetupManifests.map((m) => `- ${m.type} (${m.language}) at ${m.filePath}: install="${m.installCommand}", run="${m.runCommand}"${m.extras ? ` extras=${JSON.stringify(m.extras)}` : ""}`).join("\n")}`
      : "";
    const dockerComposeData = extraction.parsedDockerCompose
      ? `\n\nDocker Compose services:\n${extraction.parsedDockerCompose.services.map((s) => `- ${s.name}${s.image ? ` (image: ${s.image})` : ""}${s.build ? ` (build: ${s.build})` : ""} ports: ${s.ports.join(", ") || "none"}`).join("\n")}`
      : "";
    const servicesData = extraction.detectedServices.length > 0
      ? `\n\nisMonorepo: ${extraction.isMonorepo}\nDetected services:\n${extraction.detectedServices.map((s) => `- ${s.name} in ${s.directory}/${s.manifest ? ` (${s.manifest})` : ""}${s.startCommand ? ` start: ${s.startCommand}` : ""}`).join("\n")}`
      : "";
    contextData = `${pkgData}\n\n${envData}\n\n${dockerData}${manifestsData}${dockerComposeData}${servicesData}`;
  } else if (chapter.chapterType === "dependencies") {
    prompt = getDependenciesChapterPrompt(config.audience);
    contextData = extraction.parsedPackageJson
      ? `Dependencies:\n${extraction.parsedPackageJson.dependencies.map((d) => `- ${d.name}@${d.version}`).join("\n")}\n\nDev Dependencies:\n${extraction.parsedPackageJson.devDependencies.map((d) => `- ${d.name}@${d.version}`).join("\n")}`
      : "No package.json data available";
  } else if (chapter.chapterType === "troubleshooting") {
    prompt = getTroubleshootingChapterPrompt(config.audience);
    contextData = `Repository: ${extraction.repoName}\nKey files:\n${extraction.files
      .slice(0, 20)
      .map((f) => f.path)
      .join(
        "\n",
      )}\n\nAbstractions:\n${abstractions.map((a) => `- ${a.name}: ${a.description}`).join("\n")}`;
  } else { /* abstraction chapter */
    const abstraction = abstractions.find(
      (a) => a.name === chapter.abstractionRef,
    );
    const relContext = relationships
      .filter(
        (r) =>
          r.from === chapter.abstractionRef || r.to === chapter.abstractionRef,
      )
      .map((r) => `${r.from} --[${r.relation}]--> ${r.to}: ${r.description}`)
      .join("\n");

    const crossContext = buildCrossAbstractionContext(
      chapter.abstractionRef || chapter.title,
      abstractions,
      relationships,
    );

    prompt = getChapterWritePrompt(
      config.audience,
      config.depth,
      chapter.abstractionRef || chapter.title,
      abstraction?.description || "",
      relContext + crossContext,
      config.customContext,
    );

    if (abstraction) {
      const { mapped, supplemental } = await getAbstractionFilesByPageRank(abstraction, extraction);
      contextData = packAbstractionContextWithMapped(mapped, supplemental, contextBudget);
    } else {
      contextData = `No specific files assigned to this abstraction.`;
    }
  }

  const repoMapSection = `\n\n=== Full Repository Map ===\n${extraction.repoMap}`;
  const fileTreeSection = `\n\n=== Complete File Tree (${extraction.fileTree.length} files) ===\n${extraction.fullFileTreeListing || extraction.fileTree.join("\n")}`;
  contextData = contextData + repoMapSection + fileTreeSection;

  if (extraction.fileSignatures) {
    contextData += `\n\n${extraction.fileSignatures}`;
  }

  let blocks: unknown[] = [];
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const isAbstractionChapter = !chapter.chapterType || chapter.chapterType === "abstraction";
      const progressiveHint = isAbstractionChapter ? getProgressiveBlockRequirements(attempt, config.depth) : "";
      const fullPrompt = `${prompt}${progressiveHint}\n\n${contextData}`;

      const response = await generateText({
        task: "stage4",
        prompt: lastError
          ? `${fullPrompt}\n\nPrevious attempt failed validation with this error:\n${lastError}\n\nFix the schema issues and return JSON only.`
          : fullPrompt,
        responseMimeType: "application/json",
        maxOutputTokens: outputTokenBudget,
        accountLabel,
      });

      const parsed = safeParseJson(response.text) as Record<string, unknown>;
      const rawBlocks = Array.isArray(parsed.blocks)
        ? parsed.blocks
        : Array.isArray(parsed)
          ? parsed
          : [];

      if (rawBlocks.length === 0) {
        throw new Error("No blocks generated");
      }

      const validationErrors: string[] = [];
      blocks = rawBlocks
        .map((block: unknown, index: number) => {
          const normalized = normalizeBlock(block);
          const parsedBlock =
            v2ChapterSchema.shape.blocks.element.safeParse(normalized);
          if (!parsedBlock.success) {
            validationErrors.push(
              `block ${index}: ${parsedBlock.error.issues.map((issue) => issue.message).join(", ")}`,
            );
            return null;
          }
          return parsedBlock.data;
        })
        .filter(Boolean);

      if (blocks.length > 0) break;
      throw new Error(
        validationErrors.join(" | ") || "All blocks failed validation",
      );
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt === 3) {
        blocks = buildFallbackBlocks(
          chapter,
          abstractions,
          relationships,
          extraction,
        );
      }
    }
  }

  const processedBlocks = injectJargonCallouts(blocks as Array<Record<string, unknown>>);

  return {
    index: chapter.index,
    title: chapter.title,
    learningObjective: chapter.learningObjective,
    estimatedMinutes: chapter.estimatedMinutes,
    focusAreas: chapter.focusAreas,
    abstractionRef: chapter.abstractionRef,
    blocks: processedBlocks,
  };
}

export async function runStage4WriteChapters(
  chapters: OrderedChapter[],
  abstractions: Abstraction[],
  relationships: Relationship[],
  extraction: RepoExtraction,
  config: PipelineConfig,
  emitter: PipelineEmitter,
  existingChapters?: ChapterResult[],
  onChapterCheckpoint?: (completedChapters: ChapterResult[]) => Promise<void>,
): Promise<ChapterResult[]> {
  emitter.emitStageStart(
    "write_chapters",
    `Writing ${chapters.length} chapters...`,
    3,
    5,
  );

  const completedMap = new Map<number, ChapterResult>();
  if (existingChapters) {
    for (const ch of existingChapters) {
      completedMap.set(ch.index, ch);
    }
  }

  const chaptersToWrite = chapters.filter((c) => !completedMap.has(c.index));

  const stage4Task: LlmTask = "stage4";
  let healthyCount = await getHealthyAccountCount(stage4Task);
  if (healthyCount === 0) {
    console.log("[Pipeline] No healthy accounts at Stage 4 start, waiting for recovery...");
    let backoffMs = 5000;
    for (let attempt = 0; attempt < 10; attempt++) {
      await sleep(backoffMs);
      healthyCount = await getHealthyAccountCount(stage4Task);
      if (healthyCount > 0) break;
      backoffMs = Math.min(backoffMs * 2, 120000);
      console.log(`[Pipeline] Still no healthy accounts, backoff ${backoffMs}ms (attempt ${attempt + 2}/10)`);
    }
    if (healthyCount === 0) {
      console.warn("[Pipeline] All accounts still unavailable after extended backoff, proceeding with concurrency=1");
    }
  }
  const concurrency = Math.max(1, Math.min(healthyCount, 8));
  console.log(`[Pipeline] Stage 4 concurrency: ${concurrency} (${healthyCount} healthy accounts)`);

  const stageAccounts = getAccountsForStage(stage4Task);
  const results: ChapterResult[] = [...completedMap.values()];

  for (let i = 0; i < chaptersToWrite.length; i += concurrency) {
    const batch = chaptersToWrite.slice(i, i + concurrency);

    const currentHealthy = await getHealthyAccountCount(stage4Task);
    if (currentHealthy === 0) {
      console.log("[Pipeline] All accounts rate-limited, waiting with backoff...");
      let backoffMs = 5000;
      for (let attempt = 0; attempt < 10; attempt++) {
        await sleep(backoffMs);
        const recovered = await getHealthyAccountCount(stage4Task);
        if (recovered > 0) break;
        backoffMs = Math.min(backoffMs * 2, 120000);
        console.log(`[Pipeline] Still no healthy accounts, backoff ${backoffMs}ms (attempt ${attempt + 2}/10)`);
      }
    }

    const batchResults = await Promise.allSettled(
      batch.map((chapter, batchIdx) => {
        const assignedAccount = stageAccounts.length > 0
          ? stageAccounts[batchIdx % stageAccounts.length]
          : undefined;
        return writeOneChapter(
          chapter,
          abstractions,
          relationships,
          extraction,
          config,
          emitter,
          chapters.length,
          assignedAccount?.label,
        );
      }),
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const chapter = batch[j];
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
        emitter.emitChapterComplete(
          chapter.index,
          chapter.title,
          chapters.length,
        );
      } else {
        const error =
          result.status === "rejected" ? result.reason : "Unknown error";
        emitter.emitChapterFailed(
          chapter.index,
          chapter.title,
          chapters.length,
          String(error),
        );
        results.push({
          index: chapter.index,
          title: chapter.title,
          learningObjective: chapter.learningObjective,
          estimatedMinutes: chapter.estimatedMinutes,
          blocks: [
            {
              type: "callout",
              variant: "warning",
              content: `This chapter could not be generated. Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        });
      }
    }

    if (onChapterCheckpoint) {
      try {
        await onChapterCheckpoint(results);
      } catch (err) {
        console.warn(
          "[Pipeline] Chapter checkpoint save failed (non-fatal):",
          err,
        );
      }
    }
  }

  results.sort((a, b) => a.index - b.index);

  emitter.emitStageComplete(
    "write_chapters",
    `Wrote ${results.length} chapters`,
    4,
    5,
  );

  return results;
}
