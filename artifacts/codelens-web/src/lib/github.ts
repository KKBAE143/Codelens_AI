import { getUserGithubToken } from "./github-auth";
import { buildRepoMap, computePageRank } from "./repo-map";
import { countTokens } from "./token-counter";
import crypto from "crypto";

export interface GitHubFile {
  path: string;
  content: string;
  size: number;
  sha?: string;
}

export interface RepoHealthCheck {
  accessible: boolean;
  fileCount: number;
  binaryRatio: number;
  tooSmall: boolean;
  tooManyBinaries: boolean;
  isLargeRepo: boolean;
  message?: string;
}

interface GitHubTreeEntry {
  type: string;
  path: string;
  size?: number;
  sha?: string;
}

export interface RepoExtraction {
  fileTree: string[];
  files: GitHubFile[];
  repoName: string;
  owner: string;
  defaultBranch: string;
  languageBreakdown: Record<string, number>;
  estimatedComplexity: "small" | "medium" | "large";
  repoMap: string;
  packedContext: string;
  packedTokenCount: number;
  totalFilesCatalogued: number;
  filesIncludedFull: number;
  filesSkeletonOnly: number;
  sourceFileHashes: Record<string, string>;
  parsedPackageJson?: ParsedPackageJson;
  parsedEnvExample?: ParsedEnvVar[];
  parsedDockerfile?: ParsedDockerfile;
  healthCheck: RepoHealthCheck;
}

export interface ParsedPackageJson {
  dependencies: Array<{ name: string; version: string }>;
  devDependencies: Array<{ name: string; version: string }>;
  scripts: Record<string, string>;
}

export interface ParsedEnvVar {
  key: string;
  value: string;
  comment: string;
}

export interface ParsedDockerfile {
  baseImage: string;
  exposePorts: number[];
  keyCommands: string[];
}

const SKIP_PATTERNS = [
  /node_modules\//,
  /\.git\//,
  /dist\//,
  /build\//,
  /\.next\//,
  /coverage\//,
  /__pycache__\//,
  /\.cache\//,
  /vendor\//,
  /\.venv\//,
  /\.tox\//,
  /target\/debug\//,
  /target\/release\//,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.lock$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.gif$/,
  /\.svg$/,
  /\.ico$/,
  /\.woff2?$/,
  /\.ttf$/,
  /\.eot$/,
  /\.mp4$/,
  /\.webm$/,
  /\.pdf$/,
  /\.zip$/,
  /\.tar\.gz$/,
  /\.tar$/,
  /\.gz$/,
  /\.bin$/,
  /\.exe$/,
  /\.dll$/,
  /\.so$/,
  /\.dylib$/,
  /\.pyc$/,
  /\.class$/,
  /\.o$/,
];

const ALWAYS_INCLUDE_PATTERNS = [
  /^README/i,
  /^\.env\.example$/,
  /^\.env\.sample$/,
  /^Dockerfile/i,
  /^docker-compose/i,
  /^\.github\/workflows\/.*\.yml$/,
  /^\.github\/workflows\/.*\.yaml$/,
  /^package\.json$/,
  /\/package\.json$/,
  /^requirements\.txt$/,
  /^go\.mod$/,
  /^Cargo\.toml$/,
  /^tsconfig.*\.json$/,
  /\.config\.(ts|js|mjs|cjs)$/,
  /^jest\.config/,
  /^vitest\.config/,
  /^Makefile$/,
  /^drizzle\.config/,
  /^prisma\/schema\.prisma$/,
  /^openapi\.(yaml|yml|json)$/,
  /\.sql$/,
  /^pyproject\.toml$/,
  /^setup\.py$/,
  /^Gemfile$/,
  /^composer\.json$/,
  /^build\.gradle$/,
  /^pom\.xml$/,
];

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".rb", ".java",
  ".kt", ".swift", ".c", ".cpp", ".h", ".hpp", ".cs", ".php",
  ".vue", ".svelte", ".astro", ".md", ".mdx", ".yaml", ".yml",
  ".toml", ".json", ".xml", ".graphql", ".gql", ".proto",
  ".sh", ".bash", ".zsh", ".sql", ".prisma",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp4", ".webm", ".avi", ".mov",
  ".mp3", ".wav", ".ogg",
  ".pdf", ".zip", ".tar", ".gz", ".bin", ".exe", ".dll",
  ".so", ".dylib", ".pyc", ".class", ".o",
]);

const MAX_FILE_SIZE = 200_000;
const MAX_FILES_FOR_CONTENT = 100;
const TOKEN_BUDGET = 90_000;

export function parseGithubUrl(url: string): { owner: string; repo: string; branch?: string } {
  const cleaned = url.replace(/\.git$/, "").replace(/\/$/, "");
  const match = cleaned.match(
    /github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/
  );

  if (!match) {
    throw new Error(
      "Invalid GitHub URL. Expected format: github.com/owner/repo"
    );
  }

  return { owner: match[1], repo: match[2], branch: match[3] };
}

function getLanguageFromExt(ext: string): string | null {
  const map: Record<string, string> = {
    ".ts": "TypeScript", ".tsx": "TypeScript", ".js": "JavaScript",
    ".jsx": "JavaScript", ".py": "Python", ".go": "Go", ".rs": "Rust",
    ".rb": "Ruby", ".java": "Java", ".kt": "Kotlin", ".swift": "Swift",
    ".c": "C", ".cpp": "C++", ".cs": "C#", ".php": "PHP",
    ".vue": "Vue", ".svelte": "Svelte",
  };
  return map[ext] || null;
}

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(path));
}

function isAlwaysInclude(path: string): boolean {
  return ALWAYS_INCLUDE_PATTERNS.some((p) => p.test(path));
}

function isBinaryExtension(path: string): boolean {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function isCodeFile(path: string): boolean {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  return CODE_EXTENSIONS.has(ext);
}

function getDirectoryBonus(path: string): number {
  if (/^(src|lib|app|packages)\//i.test(path)) return 1.2;
  if (/\/(routes|api|services|controllers|handlers|middleware|utils|hooks|components|pages|models)\//i.test(path)) return 1.1;
  if (/\/(test|tests|spec|specs|__tests__)\//i.test(path)) return 0.4;
  if (/\/(docs|documentation|examples)\//i.test(path)) return 0.5;
  return 1.0;
}

function getExtensionBonus(path: string): number {
  const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
  if ([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb", ".php", ".c", ".cpp"].includes(ext)) return 1.0;
  if ([".json", ".yaml", ".yml", ".toml", ".xml"].includes(ext)) return 0.8;
  if ([".md", ".mdx", ".txt"].includes(ext)) return 0.6;
  if ([".sql", ".prisma", ".graphql"].includes(ext)) return 0.9;
  return 0.5;
}

function getGithubToken(userToken?: string): string | undefined {
  return userToken || process.env.GITHUB_TOKEN;
}

const GITHUB_FETCH_TIMEOUT_MS = 30_000;

async function githubFetch(url: string, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "CodeLens-AI",
  };

  const effectiveToken = getGithubToken(token);
  if (effectiveToken) {
    headers.Authorization = `Bearer ${effectiveToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`GitHub API request timed out after ${GITHUB_FETCH_TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw err;
  }
  clearTimeout(timeoutId);

  if (res.status === 404) {
    if (!effectiveToken) {
      throw new Error("Repository not found — if this is a private repo, add a GITHUB_TOKEN to access it");
    }
    throw new Error("Repository not found");
  }

  if (res.status === 403) {
    const rateLimitReset = res.headers.get("x-ratelimit-reset");
    if (rateLimitReset) {
      const resetDate = new Date(parseInt(rateLimitReset) * 1000);
      const minutesUntilReset = Math.ceil(
        (resetDate.getTime() - Date.now()) / 60000
      );
      throw new Error(
        `Rate limit exceeded — try again in ${minutesUntilReset} minutes`
      );
    }
    throw new Error("Repository is private — add a GITHUB_TOKEN to access private repos");
  }

  if (res.status === 401) {
    throw new Error("Repository is private — add a GITHUB_TOKEN to access private repos");
  }

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }

  return res;
}

export async function checkRepoHealth(
  owner: string,
  repo: string,
  branch: string,
  userToken?: string,
  preloadedTree?: GitHubTreeEntry[],
): Promise<RepoHealthCheck> {
  let tree = preloadedTree;

  if (!tree) {
    const treeRes = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      userToken,
    );
    const treeData = await treeRes.json();
    tree = Array.isArray(treeData.tree) ? (treeData.tree as GitHubTreeEntry[]) : undefined;
  }

  if (!tree) {
    return { accessible: false, fileCount: 0, binaryRatio: 0, tooSmall: false, tooManyBinaries: false, isLargeRepo: false, message: "Could not read repository file tree" };
  }

  const allBlobs = tree.filter((item) => item.type === "blob");
  const nonSkipped = allBlobs.filter((item: { path: string }) => !shouldSkip(item.path));
  const binaryCount = nonSkipped.filter((item: { path: string }) => isBinaryExtension(item.path)).length;
  const sourceCount = nonSkipped.length - binaryCount;
  const binaryRatio = nonSkipped.length > 0 ? binaryCount / nonSkipped.length : 0;
  const isLargeRepo = sourceCount > 3000;

  if (sourceCount < 5) {
    return {
      accessible: true,
      fileCount: sourceCount,
      binaryRatio,
      tooSmall: true,
      tooManyBinaries: false,
      isLargeRepo,
      message: "This repo is too small to generate a course (fewer than 5 source files)",
    };
  }

  if (binaryRatio > 0.6) {
    return {
      accessible: true,
      fileCount: sourceCount,
      binaryRatio,
      tooSmall: false,
      tooManyBinaries: true,
      isLargeRepo,
      message: "This repo doesn't have enough source code (more than 60% binary files)",
    };
  }

  if (isLargeRepo) {
    console.log(`[HealthCheck] Large repo detected: ${sourceCount} source files. Will sample top files by PageRank.`);
  }

  return { accessible: true, fileCount: sourceCount, binaryRatio, tooSmall: false, tooManyBinaries: false, isLargeRepo };
}

export function parsePackageJson(content: string): ParsedPackageJson {
  try {
    const pkg = JSON.parse(content);
    const deps = Object.entries(pkg.dependencies || {}).map(([name, version]) => ({
      name,
      version: String(version),
    }));
    const devDeps = Object.entries(pkg.devDependencies || {}).map(([name, version]) => ({
      name,
      version: String(version),
    }));
    return { dependencies: deps, devDependencies: devDeps, scripts: pkg.scripts || {} };
  } catch {
    return { dependencies: [], devDependencies: [], scripts: {} };
  }
}

export function parseEnvExample(content: string): ParsedEnvVar[] {
  const vars: ParsedEnvVar[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      if (trimmed.startsWith("# ") && trimmed.includes("=")) {
        const m = trimmed.slice(2).match(/^(\w+)\s*=/);
        if (m) vars.push({ key: m[1], value: "", comment: trimmed.slice(2) });
      }
      continue;
    }
    const match = trimmed.match(/^(\w+)\s*=\s*(.*?)(?:\s*#\s*(.*))?$/);
    if (match) {
      vars.push({ key: match[1], value: match[2] || "", comment: match[3] || "" });
    }
  }
  return vars;
}

export function parseDockerfile(content: string): ParsedDockerfile {
  const lines = content.split("\n");
  let baseImage = "";
  const exposePorts: number[] = [];
  const keyCommands: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("FROM ")) {
      baseImage = trimmed.slice(5).split(" ")[0];
    } else if (trimmed.startsWith("EXPOSE ")) {
      const ports = trimmed.slice(7).split(/\s+/).map(Number).filter(n => !isNaN(n));
      exposePorts.push(...ports);
    } else if (trimmed.startsWith("RUN ") || trimmed.startsWith("CMD ") || trimmed.startsWith("ENTRYPOINT ")) {
      keyCommands.push(trimmed);
    }
  }

  return { baseImage, exposePorts, keyCommands };
}

export async function extractRepo(
  githubUrl: string,
  userId?: string,
): Promise<RepoExtraction> {
  const { owner, repo, branch } = parseGithubUrl(githubUrl);

  let userToken: string | undefined;
  if (userId) {
    try {
      userToken = await getUserGithubToken(userId);
    } catch (err) {
      console.warn(`[Extraction] Could not retrieve GitHub token for user ${userId}:`, err instanceof Error ? err.message : err);
    }
  }

  const repoRes = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    userToken,
  );
  const repoData = await repoRes.json();
  const defaultBranch = branch || repoData.default_branch || "main";

  const treeRes = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
    userToken,
  );
  const treeData = await treeRes.json();
  const repoTree = Array.isArray(treeData.tree) ? (treeData.tree as GitHubTreeEntry[]) : null;

  const healthCheck = await checkRepoHealth(owner, repo, defaultBranch, userToken, repoTree ?? undefined);
  if (!healthCheck.accessible) {
    throw new Error(healthCheck.message || "Repository is not accessible");
  }
  if (healthCheck.tooSmall) {
    throw new Error(healthCheck.message || "Repository is too small");
  }
  if (healthCheck.tooManyBinaries) {
    throw new Error(healthCheck.message || "Repository has too many binary files");
  }

  if (!repoTree) {
    throw new Error("Could not read repository file tree.");
  }

  const allFiles: Array<{ path: string; size: number; sha: string }> = repoTree
    .filter((item) =>
      item.type === "blob" && !shouldSkip(item.path) && !isBinaryExtension(item.path)
    )
    .map((item) => ({
      path: item.path,
      size: item.size || 0,
      sha: item.sha || "",
    }));

  const fileTree = allFiles.map((f) => f.path);
  const totalFilesCatalogued = allFiles.length;

  const languageBreakdown: Record<string, number> = {};
  for (const f of allFiles) {
    const ext = f.path.substring(f.path.lastIndexOf("."));
    const lang = getLanguageFromExt(ext);
    if (lang) {
      languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1;
    }
  }

  const fetchableFiles = allFiles.filter(f => f.size <= MAX_FILE_SIZE && f.size > 0);

  const preFetchScored = fetchableFiles.map(f => {
    const extBonus = getExtensionBonus(f.path);
    const dirBonus = getDirectoryBonus(f.path);
    const alwaysBonus = isAlwaysInclude(f.path) ? 10.0 : 1.0;
    const codeBonus = isCodeFile(f.path) ? 2.0 : 0.5;
    return { ...f, preFetchScore: extBonus * dirBonus * alwaysBonus * codeBonus };
  }).sort((a, b) => b.preFetchScore - a.preFetchScore);

  const filesToFetch = preFetchScored.slice(0, MAX_FILES_FOR_CONTENT);
  const batchSize = 10;

  const fetchedFiles: GitHubFile[] = [];
  for (let i = 0; i < filesToFetch.length; i += batchSize) {
    const batch = filesToFetch.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (file) => {
        const contentRes = await githubFetch(
          `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${defaultBranch}`,
          userToken,
        );
        const contentData = await contentRes.json();
        if (contentData.content && contentData.encoding === "base64") {
          const content = Buffer.from(contentData.content, "base64").toString("utf-8");
          return { path: file.path, content, size: file.size, sha: file.sha } as GitHubFile;
        }
        return null;
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        fetchedFiles.push(result.value);
      }
    }
  }

  const pageRank = computePageRank(fetchedFiles);

  const scored = fetchedFiles.map(f => {
    const prScore = pageRank.scores.get(f.path) || 0;
    const extBonus = getExtensionBonus(f.path);
    const dirBonus = getDirectoryBonus(f.path);
    const alwaysBonus = isAlwaysInclude(f.path) ? 2.0 : 1.0;
    return {
      file: f,
      score: (prScore * 1000 + (pageRank.inDegree.get(f.path) || 0)) * extBonus * dirBonus * alwaysBonus,
    };
  }).sort((a, b) => b.score - a.score);

  const repoMap = buildRepoMap(fetchedFiles);

  const topFiles = scored.slice(0, MAX_FILES_FOR_CONTENT).map(s => s.file);

  let packedContext = buildPackedContext(fileTree, topFiles, languageBreakdown, repoMap);
  let packedTokenCount = countTokens(packedContext);

  while (packedTokenCount > TOKEN_BUDGET && topFiles.length > 10) {
    topFiles.pop();
    packedContext = buildPackedContext(fileTree, topFiles, languageBreakdown, repoMap);
    packedTokenCount = countTokens(packedContext);
  }

  const sourceFileHashes: Record<string, string> = {};
  for (const f of allFiles) {
    sourceFileHashes[f.path] = f.sha;
  }
  for (const f of fetchedFiles) {
    if (!sourceFileHashes[f.path]) {
      sourceFileHashes[f.path] = crypto.createHash("sha256").update(f.content).digest("hex");
    }
  }

  let parsedPackageJson: ParsedPackageJson | undefined;
  let parsedEnvExample: ParsedEnvVar[] | undefined;
  let parsedDockerfile: ParsedDockerfile | undefined;

  for (const f of fetchedFiles) {
    const name = f.path.split("/").pop() || "";
    if (name === "package.json" && !f.path.includes("node_modules")) {
      parsedPackageJson = parsePackageJson(f.content);
    }
    if (name === ".env.example" || name === ".env.sample") {
      parsedEnvExample = parseEnvExample(f.content);
    }
    if (name.toLowerCase().startsWith("dockerfile")) {
      parsedDockerfile = parseDockerfile(f.content);
    }
  }

  const estimatedComplexity: "small" | "medium" | "large" =
    totalFilesCatalogued < 20 ? "small" : totalFilesCatalogued < 100 ? "medium" : "large";

  console.log(`[Extraction] ${totalFilesCatalogued} files catalogued, ${topFiles.length} included full, ${totalFilesCatalogued - topFiles.length} skeleton only, ${packedTokenCount} tokens`);

  return {
    fileTree,
    files: topFiles,
    repoName: repo,
    owner,
    defaultBranch,
    languageBreakdown,
    estimatedComplexity,
    repoMap,
    packedContext,
    packedTokenCount,
    totalFilesCatalogued,
    filesIncludedFull: topFiles.length,
    filesSkeletonOnly: totalFilesCatalogued - topFiles.length,
    sourceFileHashes,
    parsedPackageJson,
    parsedEnvExample,
    parsedDockerfile,
    healthCheck,
  };
}

function buildPackedContext(
  fileTree: string[],
  files: GitHubFile[],
  languageBreakdown: Record<string, number>,
  repoMap: string,
): string {
  const langStr = Object.entries(languageBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `${lang}: ${count} files`)
    .join(", ");

  const treeStr = fileTree
    .map(path => {
      const depth = path.split("/").length - 1;
      return "  ".repeat(depth) + path.split("/").pop();
    })
    .slice(0, 500)
    .join("\n");

  const filesStr = files
    .map((f, i) => `=== File ${i}: ${f.path} ===\n${f.content}`)
    .join("\n\n");

  return `=== Repository File Tree (${fileTree.length} files total) ===
Language breakdown: ${langStr}

${treeStr}
${fileTree.length > 500 ? `\n... and ${fileTree.length - 500} more files` : ""}

${repoMap}

=== File Contents (${files.length} files) ===

${filesStr}`;
}
