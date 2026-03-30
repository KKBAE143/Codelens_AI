import { getUserGithubToken } from "./github-auth";

interface GitHubFile {
  path: string;
  content: string;
  size: number;
}

interface RepoExtraction {
  fileTree: string[];
  files: GitHubFile[];
  repoName: string;
  owner: string;
  defaultBranch: string;
  languageBreakdown: Record<string, number>;
  estimatedComplexity: "small" | "medium" | "large";
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
];

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".rb", ".java",
  ".kt", ".swift", ".c", ".cpp", ".h", ".hpp", ".cs", ".php",
  ".vue", ".svelte", ".astro", ".md", ".mdx",
]);

const MAX_FILE_SIZE = 50_000;
const MAX_FILES_TO_READ = 30;

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

function getFileScore(path: string): number {
  const lower = path.toLowerCase();
  const name = lower.split("/").pop() || "";

  if (name === "readme.md" || name === "readme.rst") return 0;

  if (
    [
      "package.json", "requirements.txt", "cargo.toml", "pyproject.toml",
      "go.mod", "gemfile", "composer.json", "build.gradle", "pom.xml",
      ".env.example", "docker-compose.yml", "dockerfile",
    ].includes(name)
  ) return 1;

  if (
    [
      "index.ts", "index.js", "main.py", "main.go", "main.rs", "app.ts",
      "app.js", "server.ts", "server.js", "mod.rs", "lib.rs",
    ].includes(name)
  ) return 2;

  if (
    /\/(routes|api|services|controllers|handlers|middleware|lib|utils|hooks|components|pages|app)\//i.test(path)
  ) return 3;

  const ext = name.substring(name.lastIndexOf("."));
  if (CODE_EXTENSIONS.has(ext)) return 4;

  return 5;
}

function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(path));
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

function getGithubToken(userToken?: string): string | undefined {
  return userToken || process.env.GITHUB_TOKEN;
}

async function githubFetch(
  url: string,
  token?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "CodeLens-AI",
  };

  const effectiveToken = getGithubToken(token);
  if (effectiveToken) {
    headers.Authorization = `Bearer ${effectiveToken}`;
  }

  const res = await fetch(url, { headers });

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

export async function extractRepo(
  githubUrl: string,
  userId?: string
): Promise<RepoExtraction> {
  const { owner, repo, branch } = parseGithubUrl(githubUrl);

  let userToken: string | undefined;
  if (userId) {
    try {
      userToken = await getUserGithubToken(userId);
    } catch {
      // User hasn't connected GitHub — fall back to GITHUB_TOKEN or public access
    }
  }

  const repoRes = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    userToken
  );
  const repoData = await repoRes.json();
  const defaultBranch = branch || repoData.default_branch || "main";

  const treeRes = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
    userToken
  );
  const treeData = await treeRes.json();

  if (!treeData.tree) {
    throw new Error("Could not read repository file tree.");
  }

  const allFiles: Array<{ path: string; size: number }> = treeData.tree
    .filter((item: { type: string; path: string; size?: number }) =>
      item.type === "blob" && !shouldSkip(item.path)
    )
    .map((item: { path: string; size?: number }) => ({
      path: item.path,
      size: item.size || 0,
    }));

  const fileTree = allFiles.map((f) => f.path);

  const scoredFiles = allFiles
    .filter((f) => f.size <= MAX_FILE_SIZE && f.size > 0)
    .map((f) => ({ ...f, score: getFileScore(f.path) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, MAX_FILES_TO_READ);

  const files: GitHubFile[] = [];
  for (const file of scoredFiles) {
    try {
      const contentRes = await githubFetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}?ref=${defaultBranch}`,
        userToken
      );
      const contentData = await contentRes.json();

      if (contentData.content && contentData.encoding === "base64") {
        const content = Buffer.from(contentData.content, "base64").toString("utf-8");
        files.push({ path: file.path, content, size: file.size });
      }
    } catch {
      // Skip files that can't be read
    }
  }

  const languageBreakdown: Record<string, number> = {};
  for (const f of allFiles) {
    const ext = f.path.substring(f.path.lastIndexOf("."));
    const lang = getLanguageFromExt(ext);
    if (lang) {
      languageBreakdown[lang] = (languageBreakdown[lang] || 0) + 1;
    }
  }

  const totalFiles = allFiles.length;
  const estimatedComplexity: "small" | "medium" | "large" =
    totalFiles < 20 ? "small" : totalFiles < 100 ? "medium" : "large";

  return {
    fileTree,
    files,
    repoName: repo,
    owner,
    defaultBranch,
    languageBreakdown,
    estimatedComplexity,
  };
}
