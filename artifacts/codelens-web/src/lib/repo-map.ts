const SIGNATURE_PATTERNS: Record<string, RegExp[]> = {
  ts: [
    /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm,
    /^export\s+(?:default\s+)?class\s+(\w+)/gm,
    /^export\s+(?:const|let|var)\s+(\w+)\s*[=:]/gm,
    /^export\s+(?:default\s+)?interface\s+(\w+)/gm,
    /^export\s+(?:default\s+)?type\s+(\w+)/gm,
    /^export\s+(?:default\s+)?enum\s+(\w+)/gm,
  ],
  js: [
    /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm,
    /^export\s+(?:default\s+)?class\s+(\w+)/gm,
    /^module\.exports\s*=\s*\{([^}]+)\}/gm,
    /^(?:async\s+)?function\s+(\w+)/gm,
  ],
  py: [
    /^def\s+(\w+)\s*\(/gm,
    /^class\s+(\w+)/gm,
    /^(\w+)\s*=\s*(?:lambda|namedtuple|TypeVar|NewType)/gm,
  ],
  go: [
    /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/gm,
    /^type\s+(\w+)\s+(?:struct|interface)/gm,
  ],
  rs: [
    /^pub\s+(?:async\s+)?fn\s+(\w+)/gm,
    /^pub\s+struct\s+(\w+)/gm,
    /^pub\s+enum\s+(\w+)/gm,
    /^pub\s+trait\s+(\w+)/gm,
    /^impl(?:<[^>]+>)?\s+(\w+)/gm,
  ],
  java: [
    /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:class|interface|enum)\s+(\w+)/gm,
    /^\s*(?:public|private|protected)\s+(?:static\s+)?(?:\w+(?:<[^>]+>)?)\s+(\w+)\s*\(/gm,
  ],
  rb: [
    /^(?:def|class|module)\s+(\w+)/gm,
  ],
  php: [
    /^(?:class|interface|trait|function)\s+(\w+)/gm,
    /^(?:public|private|protected)\s+(?:static\s+)?function\s+(\w+)/gm,
  ],
  c: [
    /^(?:static\s+)?(?:inline\s+)?(?:\w+[\s*]+)+(\w+)\s*\([^)]*\)\s*\{/gm,
    /^typedef\s+(?:struct|enum|union)\s+(?:\w+\s+)?(\w+)\s*;/gm,
  ],
};

SIGNATURE_PATTERNS.tsx = SIGNATURE_PATTERNS.ts;
SIGNATURE_PATTERNS.jsx = SIGNATURE_PATTERNS.js;
SIGNATURE_PATTERNS.cpp = SIGNATURE_PATTERNS.c;
SIGNATURE_PATTERNS.h = SIGNATURE_PATTERNS.c;
SIGNATURE_PATTERNS.hpp = SIGNATURE_PATTERNS.c;

const EXT_TO_LANG: Record<string, string> = {
  ".ts": "ts", ".tsx": "tsx", ".js": "js", ".jsx": "jsx",
  ".py": "py", ".go": "go", ".rs": "rs", ".java": "java",
  ".rb": "rb", ".php": "php", ".c": "c", ".cpp": "cpp",
  ".h": "h", ".hpp": "hpp",
};

export interface RepoMapEntry {
  path: string;
  symbols: string[];
}

export function extractSignatures(path: string, content: string): string[] {
  const ext = path.substring(path.lastIndexOf("."));
  const lang = EXT_TO_LANG[ext];
  if (!lang || !SIGNATURE_PATTERNS[lang]) return [];

  const symbols = new Set<string>();
  for (const pattern of SIGNATURE_PATTERNS[lang]) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        symbols.add(match[1]);
      }
    }
  }
  return Array.from(symbols);
}

export function buildRepoMap(files: Array<{ path: string; content: string }>): string {
  const entries: RepoMapEntry[] = [];

  for (const file of files) {
    const symbols = extractSignatures(file.path, file.content);
    if (symbols.length > 0) {
      entries.push({ path: file.path, symbols });
    }
  }

  const lines: string[] = ["=== Repository Map (function/class signatures) ==="];
  for (const entry of entries) {
    lines.push(`${entry.path}:`);
    for (const sym of entry.symbols) {
      lines.push(`  ${sym}`);
    }
  }

  return lines.join("\n");
}

const IMPORT_PATTERNS: Record<string, RegExp[]> = {
  ts: [
    /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  py: [
    /^from\s+(\S+)\s+import/gm,
    /^import\s+(\S+)/gm,
  ],
  go: [
    /^\s*"([^"]+)"/gm,
  ],
  rs: [
    /^use\s+(\w+(?:::\w+)*)/gm,
  ],
  java: [
    /^import\s+(\S+);/gm,
  ],
  rb: [
    /^require\s+['"]([^'"]+)['"]/gm,
    /^require_relative\s+['"]([^'"]+)['"]/gm,
  ],
  php: [
    /^use\s+(\S+);/gm,
    /require(?:_once)?\s+['"]([^'"]+)['"]/gm,
  ],
};

IMPORT_PATTERNS.tsx = IMPORT_PATTERNS.ts;
IMPORT_PATTERNS.jsx = IMPORT_PATTERNS.ts;
IMPORT_PATTERNS.js = IMPORT_PATTERNS.ts;

export function parseImports(path: string, content: string): string[] {
  const ext = path.substring(path.lastIndexOf("."));
  const lang = EXT_TO_LANG[ext];
  if (!lang || !IMPORT_PATTERNS[lang]) return [];

  const imports: string[] = [];
  for (const pattern of IMPORT_PATTERNS[lang]) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        imports.push(match[1]);
      }
    }
  }
  return imports;
}

export function resolveImportToFile(
  importPath: string,
  importerPath: string,
  allPaths: Set<string>,
): string | null {
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) return null;

  const importerDir = importerPath.substring(0, importerPath.lastIndexOf("/")) || ".";
  let resolved = importPath;

  if (importPath.startsWith(".")) {
    const parts = importerDir.split("/");
    const importParts = importPath.split("/");
    for (const part of importParts) {
      if (part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    resolved = parts.join("/");
  }

  if (allPaths.has(resolved)) return resolved;

  const extensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"];
  for (const ext of extensions) {
    if (allPaths.has(resolved + ext)) return resolved + ext;
  }

  for (const ext of extensions) {
    const indexPath = resolved + "/index" + ext;
    if (allPaths.has(indexPath)) return indexPath;
  }

  return null;
}

export interface PageRankResult {
  scores: Map<string, number>;
  inDegree: Map<string, number>;
}

export function computePageRank(
  files: Array<{ path: string; content: string }>,
): PageRankResult {
  const allPaths = new Set(files.map(f => f.path));
  const inDegree = new Map<string, number>();
  const graph = new Map<string, Set<string>>();

  for (const path of allPaths) {
    inDegree.set(path, 0);
    graph.set(path, new Set());
  }

  for (const file of files) {
    const imports = parseImports(file.path, file.content);
    for (const imp of imports) {
      const resolved = resolveImportToFile(imp, file.path, allPaths);
      if (resolved && resolved !== file.path) {
        graph.get(file.path)?.add(resolved);
        inDegree.set(resolved, (inDegree.get(resolved) || 0) + 1);
      }
    }
  }

  const scores = new Map<string, number>();
  const n = allPaths.size;
  if (n === 0) return { scores, inDegree };

  for (const path of allPaths) {
    scores.set(path, 1 / n);
  }

  const d = 0.85;
  const iterations = 20;

  for (let i = 0; i < iterations; i++) {
    const newScores = new Map<string, number>();
    for (const path of allPaths) {
      newScores.set(path, (1 - d) / n);
    }

    for (const [source, targets] of graph) {
      const sourceScore = scores.get(source) || 0;
      const outDegree = targets.size;
      if (outDegree === 0) continue;
      const share = sourceScore / outDegree;
      for (const target of targets) {
        newScores.set(target, (newScores.get(target) || 0) + d * share);
      }
    }

    for (const [path, score] of newScores) {
      scores.set(path, score);
    }
  }

  return { scores, inDegree };
}
