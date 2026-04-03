import { getUserGithubToken } from "./github-auth";
import { buildRepoMap, computePageRank } from "./repo-map";
import { countTokens } from "./token-counter";
import crypto from "crypto";

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const apiCache = new Map<string, CacheEntry<unknown>>();
const TREE_CACHE_TTL = 5 * 60 * 1000;
const REPO_CACHE_TTL = 15 * 60 * 1000;

function getCacheKey(url: string, token?: string): string {
  const tokenSuffix = token ? token.slice(-8) : "none";
  return `${url}|${tokenSuffix}`;
}

function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    apiCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T, ttl: number): void {
  apiCache.set(key, { data, expires: Date.now() + ttl });
}

export function clearCache(): void {
  apiCache.clear();
}

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
  allFetchedFiles: GitHubFile[];
  repoName: string;
  owner: string;
  defaultBranch: string;
  commitSha: string;
  languageBreakdown: Record<string, number>;
  estimatedComplexity: "small" | "medium" | "large";
  repoMap: string;
  fullFileTreeListing: string;
  packedContext: string;
  packedTokenCount: number;
  totalFilesCatalogued: number;
  filesIncludedFull: number;
  filesSkeletonOnly: number;
  fileSignatures: string;
  sourceFileHashes: Record<string, string>;
  parsedPackageJson?: ParsedPackageJson;
  parsedEnvExample?: ParsedEnvVar[];
  parsedDockerfile?: ParsedDockerfile;
  parsedSetupManifests: ParsedManifest[];
  parsedDockerCompose?: ParsedDockerCompose;
  isMonorepo: boolean;
  detectedServices: DetectedService[];
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

const MAX_FILE_SIZE = 1_000_000;
const SIGNATURE_FILE_SIZE = 5_000_000;
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
  if (/\/(test|tests|spec|specs|__tests__)\//i.test(path)) return 0.9;
  if (/\/(docs|documentation|examples)\//i.test(path)) return 0.85;
  if (/\/(scripts|tools|bin)\//i.test(path)) return 0.9;
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

export function extractFileSignatures(content: string, filePath: string): string {
  const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
  const lines = content.split("\n");
  const first200 = lines.slice(0, 200).join("\n");

  const signaturePatterns: RegExp[] = [];
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(ext)) {
    signaturePatterns.push(
      /^export\s+(default\s+)?(async\s+)?function\s+\w+/gm,
      /^export\s+(const|let|var|class|interface|type|enum)\s+\w+/gm,
      /^(async\s+)?function\s+\w+/gm,
      /^(class|interface|type|enum)\s+\w+/gm,
      /^module\.exports\s*=/gm,
    );
  } else if (ext === ".py") {
    signaturePatterns.push(
      /^(async\s+)?def\s+\w+/gm,
      /^class\s+\w+/gm,
    );
  } else if (ext === ".go") {
    signaturePatterns.push(
      /^func\s+(\(\w+\s+\*?\w+\)\s+)?\w+/gm,
      /^type\s+\w+\s+(struct|interface)/gm,
    );
  } else if (ext === ".rs") {
    signaturePatterns.push(
      /^pub\s+(async\s+)?fn\s+\w+/gm,
      /^(pub\s+)?(struct|enum|trait|impl)\s+\w+/gm,
    );
  } else if ([".java", ".kt"].includes(ext)) {
    signaturePatterns.push(
      /^(\s*)(public|private|protected)?\s*(static\s+)?(class|interface|enum)\s+\w+/gm,
      /^(\s*)(public|private|protected)?\s*(static\s+)?[\w<>\[\]]+\s+\w+\s*\(/gm,
    );
  } else if (ext === ".rb") {
    signaturePatterns.push(
      /^(\s*)(def|class|module)\s+\w+/gm,
    );
  } else if (ext === ".php") {
    signaturePatterns.push(
      /^(\s*)(public|private|protected)?\s*(static\s+)?function\s+\w+/gm,
      /^(\s*)class\s+\w+/gm,
    );
  }

  const signatures: string[] = [];
  const fullContent = content;
  for (const pattern of signaturePatterns) {
    let match;
    while ((match = pattern.exec(fullContent)) !== null) {
      signatures.push(match[0].trim());
    }
  }

  const uniqueSigs = [...new Set(signatures)].slice(0, 50);
  if (uniqueSigs.length === 0) return first200;

  return `${first200}\n\n--- Signatures (remaining file) ---\n${uniqueSigs.join("\n")}`;
}

export interface ParsedManifest {
  type: string;
  filePath: string;
  installCommand: string;
  runCommand: string;
  language: string;
  extras?: Record<string, string>;
}

export interface ParsedDockerCompose {
  services: Array<{ name: string; image?: string; ports: string[]; build?: string }>;
}

export interface DetectedService {
  name: string;
  directory: string;
  manifest?: string;
  startCommand?: string;
}

function parseManifest(content: string, filePath: string): ParsedManifest | null {
  const name = filePath.split("/").pop() || "";

  if (name === "package.json") {
    try {
      const pkg = JSON.parse(content);
      const scripts = pkg.scripts || {};
      const runCmd = scripts.dev || scripts.start || scripts.serve || "npm start";
      return { type: "npm", filePath, installCommand: "npm install", runCommand: typeof runCmd === "string" ? runCmd : "npm start", language: "JavaScript/TypeScript" };
    } catch { return null; }
  }

  if (name === "requirements.txt") {
    return { type: "pip", filePath, installCommand: "pip install -r requirements.txt", runCommand: "python main.py", language: "Python" };
  }

  if (name === "pyproject.toml") {
    const hasPoetry = content.includes("[tool.poetry]");
    return {
      type: hasPoetry ? "poetry" : "pip",
      filePath,
      installCommand: hasPoetry ? "poetry install" : "pip install -e .",
      runCommand: hasPoetry ? "poetry run python main.py" : "python main.py",
      language: "Python",
    };
  }

  if (name === "Pipfile") {
    return { type: "pipenv", filePath, installCommand: "pipenv install", runCommand: "pipenv run python main.py", language: "Python" };
  }

  if (name === "go.mod") {
    return { type: "go", filePath, installCommand: "go mod download", runCommand: "go run .", language: "Go" };
  }

  if (name === "Cargo.toml") {
    return { type: "cargo", filePath, installCommand: "cargo build", runCommand: "cargo run", language: "Rust" };
  }

  if (name === "Gemfile") {
    return { type: "bundler", filePath, installCommand: "bundle install", runCommand: "bundle exec ruby main.rb", language: "Ruby" };
  }

  if (name === "composer.json") {
    return { type: "composer", filePath, installCommand: "composer install", runCommand: "php artisan serve", language: "PHP" };
  }

  if (name === "pom.xml") {
    return { type: "maven", filePath, installCommand: "mvn install", runCommand: "mvn spring-boot:run", language: "Java" };
  }

  if (name === "build.gradle" || name === "build.gradle.kts") {
    return { type: "gradle", filePath, installCommand: "./gradlew build", runCommand: "./gradlew bootRun", language: "Java/Kotlin" };
  }

  if (name === "Makefile") {
    const targets: string[] = [];
    for (const line of content.split("\n")) {
      const m = line.match(/^([a-zA-Z_-]+)\s*:/);
      if (m && !m[1].startsWith(".")) targets.push(m[1]);
    }
    return {
      type: "make",
      filePath,
      installCommand: "make install",
      runCommand: targets.includes("run") ? "make run" : targets.includes("dev") ? "make dev" : "make",
      language: "Multi",
      extras: { targets: targets.slice(0, 10).join(", ") },
    };
  }

  return null;
}

function parseDockerCompose(content: string): ParsedDockerCompose | null {
  try {
    const services: ParsedDockerCompose["services"] = [];
    const serviceBlockRegex = /^\s{2}(\w[\w-]*):\s*$/gm;
    let match;
    while ((match = serviceBlockRegex.exec(content)) !== null) {
      const serviceName = match[1];
      const startIdx = match.index + match[0].length;
      const nextServiceMatch = content.slice(startIdx).search(/^\s{2}\w[\w-]*:\s*$/m);
      const block = nextServiceMatch === -1
        ? content.slice(startIdx)
        : content.slice(startIdx, startIdx + nextServiceMatch);

      const imageMatch = block.match(/image:\s*["']?([^\s"']+)/);
      const buildMatch = block.match(/build:\s*["']?([^\s"']+)/);
      const ports: string[] = [];
      const portMatches = block.matchAll(/- ["']?(\d+:\d+)["']?/g);
      for (const pm of portMatches) {
        ports.push(pm[1]);
      }
      services.push({ name: serviceName, image: imageMatch?.[1], build: buildMatch?.[1], ports });
    }
    return services.length > 0 ? { services } : null;
  } catch {
    return null;
  }
}

function detectServices(allFiles: Array<{ path: string; size: number }>): DetectedService[] {
  const rootDirs = new Set<string>();
  const manifestNames = new Set([
    "package.json", "requirements.txt", "pyproject.toml", "go.mod",
    "Cargo.toml", "Gemfile", "composer.json", "pom.xml", "build.gradle",
  ]);

  for (const f of allFiles) {
    const parts = f.path.split("/");
    if (parts.length >= 2) {
      const fileName = parts[parts.length - 1];
      if (manifestNames.has(fileName)) {
        const dir = parts.slice(0, -1).join("/");
        if (dir && !dir.includes("/")) {
          rootDirs.add(dir);
        }
      }
    }
  }

  const frontendNames = /^(frontend|client|web|app|ui)$/i;
  const backendNames = /^(backend|server|api|service|worker)$/i;

  const services: DetectedService[] = [];
  for (const dir of rootDirs) {
    let name = dir;
    if (frontendNames.test(dir)) name = "Frontend";
    else if (backendNames.test(dir)) name = "Backend";
    services.push({ name, directory: dir });
  }

  return services;
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

  const repoCacheKey = getCacheKey(
    `https://api.github.com/repos/${owner}/${repo}`,
    userToken,
  );
  let repoData: Record<string, unknown> | null = getCached<Record<string, unknown>>(repoCacheKey);
  if (!repoData) {
    const repoRes = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      userToken,
    );
    repoData = (await repoRes.json()) as Record<string, unknown>;
    setCached(repoCacheKey, repoData, REPO_CACHE_TTL);
  }
  const defaultBranch = branch || (repoData.default_branch as string) || "main";

  const treeCacheKey = getCacheKey(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
    userToken,
  );
  let treeData: { tree: GitHubTreeEntry[]; sha?: string } | null = getCached<{ tree: GitHubTreeEntry[]; sha?: string }>(treeCacheKey);
  if (!treeData) {
    const treeRes = await githubFetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
      userToken,
    );
    treeData = (await treeRes.json()) as { tree: GitHubTreeEntry[]; sha?: string };
    setCached(treeCacheKey, treeData, TREE_CACHE_TTL);
  }
  const repoTree = Array.isArray(treeData.tree) ? treeData.tree : null;
  const commitSha = treeData?.sha || "";

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

  const fullSizeFiles = allFiles.filter(f => f.size <= MAX_FILE_SIZE && f.size > 0);
  const signatureSizeFiles = allFiles.filter(f => f.size > MAX_FILE_SIZE && f.size <= SIGNATURE_FILE_SIZE);

  const preFetchScored = fullSizeFiles.map(f => {
    const extBonus = getExtensionBonus(f.path);
    const dirBonus = getDirectoryBonus(f.path);
    const alwaysBonus = isAlwaysInclude(f.path) ? 10.0 : 1.0;
    const codeBonus = isCodeFile(f.path) ? 2.0 : 0.5;
    return { ...f, preFetchScore: extBonus * dirBonus * alwaysBonus * codeBonus };
  }).sort((a, b) => b.preFetchScore - a.preFetchScore);

  const batchSize = 10;
  let fetchedTokenEstimate = 0;
  const fetchTokenCeiling = TOKEN_BUDGET * 3;

  const fetchedFiles: GitHubFile[] = [];
  for (let i = 0; i < preFetchScored.length; i += batchSize) {
    if (fetchedTokenEstimate > fetchTokenCeiling) break;
    const batch = preFetchScored.slice(i, i + batchSize);
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
        fetchedTokenEstimate += Math.ceil(result.value.size / 4);
      }
    }
  }

  const signatureFiles: GitHubFile[] = [];
  const sigBatchSize = 5;
  for (let i = 0; i < signatureSizeFiles.length; i += sigBatchSize) {
    const batch = signatureSizeFiles.slice(i, i + sigBatchSize);
    const results = await Promise.allSettled(
      batch.map(async (file) => {
        try {
          const blobRes = await githubFetch(
            `https://api.github.com/repos/${owner}/${repo}/git/blobs/${file.sha}`,
            userToken,
          );
          const blobData = await blobRes.json();
          if (blobData.content && blobData.encoding === "base64") {
            const rawContent = Buffer.from(blobData.content, "base64").toString("utf-8");
            const sigContent = extractFileSignatures(rawContent, file.path);
            return { path: file.path, content: sigContent, size: file.size, sha: file.sha } as GitHubFile;
          }
        } catch { /* skip files that fail */ }
        return null;
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        signatureFiles.push(result.value);
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

  const topFiles: GitHubFile[] = [];
  let runningTokens = 0;
  const repoMapTokens = countTokens(repoMap);
  const treeOverhead = countTokens(fileTree.slice(0, 500).join("\n"));
  runningTokens += repoMapTokens + treeOverhead + 500;

  for (const s of scored) {
    const fileTokens = countTokens(s.file.content);
    if (runningTokens + fileTokens > TOKEN_BUDGET && topFiles.length >= 10) break;
    topFiles.push(s.file);
    runningTokens += fileTokens;
  }

  let fileSignaturesText = "";
  const includedPaths = new Set(topFiles.map(f => f.path));
  const remainingFetched = fetchedFiles.filter(f => !includedPaths.has(f.path));
  const sigEntries: string[] = [];
  for (const f of [...remainingFetched, ...signatureFiles]) {
    if (includedPaths.has(f.path)) continue;
    includedPaths.add(f.path);
    const sigs = extractFileSignatures(f.content, f.path);
    const sigLines = sigs.split("\n").filter(l => l.startsWith("export ") || l.startsWith("function ") || l.startsWith("class ") || l.startsWith("def ") || l.startsWith("func ") || l.startsWith("pub ") || l.startsWith("type ") || l.startsWith("interface ") || l.match(/^(public|private|protected)/));
    if (sigLines.length > 0) {
      sigEntries.push(`${f.path}:\n  ${sigLines.slice(0, 20).join("\n  ")}`);
    }
  }

  let packedContext = buildPackedContext(fileTree, topFiles, languageBreakdown, repoMap);
  let packedTokenCount = countTokens(packedContext);

  const sigBudgetRemaining = TOKEN_BUDGET - packedTokenCount;
  if (sigEntries.length > 0 && sigBudgetRemaining > 500) {
    const trimmedSigEntries: string[] = [];
    let sigTokens = 0;
    const sigHeader = `=== File Signatures (additional files) ===\n`;
    sigTokens += countTokens(sigHeader);
    for (const entry of sigEntries) {
      const entryTokens = countTokens(entry);
      if (sigTokens + entryTokens > sigBudgetRemaining) break;
      trimmedSigEntries.push(entry);
      sigTokens += entryTokens;
    }
    if (trimmedSigEntries.length > 0) {
      fileSignaturesText = `=== File Signatures (${trimmedSigEntries.length} additional files) ===\n${trimmedSigEntries.join("\n\n")}`;
      packedContext += `\n\n${fileSignaturesText}`;
      packedTokenCount = countTokens(packedContext);
    }
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
  const parsedSetupManifests: ParsedManifest[] = [];
  let parsedDockerCompose: ParsedDockerCompose | undefined;

  const manifestFileNames = new Set([
    "package.json", "requirements.txt", "pyproject.toml", "Pipfile",
    "go.mod", "Cargo.toml", "Gemfile", "composer.json", "pom.xml",
    "build.gradle", "build.gradle.kts", "Makefile",
  ]);

  for (const f of fetchedFiles) {
    const name = f.path.split("/").pop() || "";
    if (name === "package.json" && !f.path.includes("node_modules") && !parsedPackageJson) {
      parsedPackageJson = parsePackageJson(f.content);
    }
    if (/^\.env\.(example|sample|local|development|dev|template)$/i.test(name) || name === ".env.example" || name === ".env.sample") {
      if (!parsedEnvExample) {
        parsedEnvExample = parseEnvExample(f.content);
      } else {
        const additional = parseEnvExample(f.content);
        const existingKeys = new Set(parsedEnvExample.map(v => v.key));
        for (const v of additional) {
          if (!existingKeys.has(v.key)) {
            parsedEnvExample.push(v);
          }
        }
      }
    }
    if (name.toLowerCase().startsWith("dockerfile") && !parsedDockerfile) {
      parsedDockerfile = parseDockerfile(f.content);
    }
    if ((name === "docker-compose.yml" || name === "docker-compose.yaml" || name === "compose.yaml" || name === "compose.yml") && !parsedDockerCompose) {
      parsedDockerCompose = parseDockerCompose(f.content) || undefined;
    }
    if (manifestFileNames.has(name)) {
      const manifest = parseManifest(f.content, f.path);
      if (manifest) {
        parsedSetupManifests.push(manifest);
      }
    }
  }

  const detectedServices = detectServices(allFiles);
  const isMonorepo = detectedServices.length >= 2 || allFiles.some(f => f.path === "pnpm-workspace.yaml" || f.path === "lerna.json" || f.path === "turbo.json");

  for (const svc of detectedServices) {
    const svcManifest = parsedSetupManifests.find(m => m.filePath.startsWith(svc.directory + "/"));
    if (svcManifest) {
      svc.manifest = svcManifest.type;
      svc.startCommand = svcManifest.runCommand;
    }
  }

  const estimatedComplexity: "small" | "medium" | "large" =
    totalFilesCatalogued < 20 ? "small" : totalFilesCatalogued < 100 ? "medium" : "large";

  const filesSignatureOnly = signatureFiles.length;
  const filesSkeletonOnly = totalFilesCatalogued - topFiles.length - filesSignatureOnly;

  const fullFileTreeListing = allFiles
    .map(f => {
      const ext = f.path.substring(f.path.lastIndexOf(".")).toLowerCase();
      const lang = getLanguageFromExt(ext);
      const sizeKB = Math.round(f.size / 1024);
      return `${f.path} (${sizeKB}KB${lang ? `, ${lang}` : ""})`;
    })
    .join("\n");

  console.log(`[Extraction] ${totalFilesCatalogued} files catalogued, ${topFiles.length} included full, ${filesSignatureOnly} signature-only, ${filesSkeletonOnly} skeleton only, ${packedTokenCount} tokens`);

  return {
    fileTree,
    files: topFiles,
    allFetchedFiles: fetchedFiles,
    repoName: repo,
    owner,
    defaultBranch,
    commitSha,
    languageBreakdown,
    estimatedComplexity,
    repoMap,
    fullFileTreeListing,
    packedContext,
    packedTokenCount,
    totalFilesCatalogued,
    filesIncludedFull: topFiles.length,
    filesSkeletonOnly,
    fileSignatures: fileSignaturesText,
    sourceFileHashes,
    parsedPackageJson,
    parsedEnvExample,
    parsedDockerfile,
    parsedSetupManifests,
    parsedDockerCompose,
    isMonorepo,
    detectedServices,
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
