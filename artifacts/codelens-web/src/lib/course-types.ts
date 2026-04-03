export interface V2TextBlock {
  type: "text";
  content: string;
}

export interface V2CodeBlock {
  type: "code";
  language: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  content: string;
  caption?: string;
}

export interface V2MermaidBlock {
  type: "mermaid";
  diagramType?: "flowchart" | "sequenceDiagram" | "erDiagram" | "classDiagram" | "graph";
  source: string;
  caption?: string;
}

export interface V2QuizOption {
  text: string;
  correct: boolean;
  explanation: string;
}

export interface V2QuizBlock {
  type: "quiz";
  question: string;
  scenario?: string;
  options: V2QuizOption[];
}

export interface V2CalloutBlock {
  type: "callout";
  variant: "warning" | "tip" | "ai-hint" | "first-pr" | "security" | "command";
  content: string;
}

export interface V2FileListItem {
  path: string;
  role: string;
  lineCount?: number;
  githubUrl?: string;
}

export interface V2FileListBlock {
  type: "file-list";
  files: V2FileListItem[];
}

export interface V2ArchitectureCardBlock {
  type: "architecture-card";
  decision: string;
  rationale: string;
  tradeoffs: string;
  alternatives?: string;
}

export interface V2DependencyCardBlock {
  type: "dependency-card";
  packageName: string;
  version?: string;
  purpose: string;
  whatBreaksWithout?: string;
  alternatives?: string;
}

export interface V2EnvVarCardBlock {
  type: "env-var-card";
  varName: string;
  required: boolean;
  purpose: string;
  exampleValue?: string;
  whatBreaksWithout?: string;
}

export interface V2CommandCardBlock {
  type: "command-card";
  command: string;
  when: string;
  expectedOutput?: string;
  commonErrors?: Array<{ error: string; fix: string }>;
}

export interface V2ExerciseBlock {
  type: "exercise";
  title: string;
  task: string;
  files?: Array<{ path: string; githubUrl?: string }>;
  verificationHint?: string;
  difficulty?: "easy" | "medium" | "hard";
}

export type V2Block =
  | V2TextBlock
  | V2CodeBlock
  | V2MermaidBlock
  | V2QuizBlock
  | V2CalloutBlock
  | V2FileListBlock
  | V2ArchitectureCardBlock
  | V2DependencyCardBlock
  | V2EnvVarCardBlock
  | V2CommandCardBlock
  | V2ExerciseBlock;

export interface V2Module {
  index: number;
  title: string;
  learningObjective?: string;
  estimatedMinutes?: number;
  focusAreas?: string[];
  blocks: V2Block[];
}

export interface V2OverviewGraph {
  nodes: Array<{
    id: string;
    label: string;
    moduleIndex: number;
    connections: number;
    description?: string;
    fileCount?: number;
  }>;
  edges: Array<{
    from: string;
    to: string;
    relation: string;
    label?: string;
  }>;
}

export interface V2ConceptIndexEntry {
  term: string;
  moduleIndices: number[];
  description: string;
}

export interface V2CodebasePassport {
  repoName: string;
  owner: string;
  totalFiles: number;
  filesAnalyzed: number;
  topLanguages: Array<{ language: string; fileCount: number }>;
  abstractionCount: number;
  relationshipCount: number;
  moduleCount: number;
  estimatedMinutes: number;
  persona: string;
  depth: string;
  coreComponents: Array<{ name: string; connections: number }>;
}

export interface V2CourseData {
  version: 2;
  repoName: string;
  ownerName: string;
  githubUrl: string;
  persona: string;
  depth: "quick" | "full" | "deep";
  totalModules: number;
  estimatedTotalMinutes: number;
  languages: string[];
  frameworks: string[];
  fileCount: number;
  abstractionCount: number;
  overviewGraph?: V2OverviewGraph;
  conceptIndex?: V2ConceptIndexEntry[];
  codebasePassport?: V2CodebasePassport;
  modules: V2Module[];
}

export function normalizeV2CourseData(data: V2CourseData): V2CourseData {
  const modules = [...data.modules].sort(
    (a, b) => a.index - b.index || a.title.localeCompare(b.title),
  );

  return {
    ...data,
    totalModules: modules.length,
    modules,
  };
}

export const V2_PREFIX = "__codelens_v2__";

export function isV2Course(html: string): boolean {
  return html.startsWith(V2_PREFIX);
}

export function parseV2Course(html: string): V2CourseData | null {
  if (!isV2Course(html)) return null;
  try {
    const data = JSON.parse(html.slice(V2_PREFIX.length));
    if (
      !data ||
      typeof data !== "object" ||
      data.version !== 2 ||
      !Array.isArray(data.modules) ||
      data.modules.length === 0 ||
      typeof data.totalModules !== "number" ||
      typeof data.repoName !== "string" ||
      typeof data.githubUrl !== "string"
    ) {
      return null;
    }
    for (const mod of data.modules) {
      if (!mod || typeof mod.title !== "string" || !Array.isArray(mod.blocks)) {
        return null;
      }
    }
    return normalizeV2CourseData(data as V2CourseData);
  } catch {
    return null;
  }
}

export interface WizardConfig {
  persona: string;
  depth: "quick" | "full" | "deep";
  focusAreas: string[];
  customContext: string;
}

export const DEPTH_PRESETS = {
  quick: { label: "Quick Tour", modules: 6, minutes: 20, description: "Get the big picture fast" },
  full: { label: "Full Onboarding", modules: 10, minutes: 45, description: "Thorough walkthrough of the codebase" },
  deep: { label: "Deep Dive", modules: 15, minutes: 90, description: "Exhaustive coverage of every component" },
} as const;

export const FOCUS_AREAS = [
  { key: "auth", label: "Auth & Security", emoji: "🔐" },
  { key: "api", label: "APIs & Integrations", emoji: "🔌" },
  { key: "data", label: "Data & Database", emoji: "🗄️" },
  { key: "devops", label: "DevOps & Setup", emoji: "🚀" },
  { key: "architecture", label: "Architecture & Patterns", emoji: "🏗️" },
  { key: "testing", label: "Testing & Quality", emoji: "🧪" },
  { key: "deps", label: "Dependencies & Packages", emoji: "📦" },
  { key: "config", label: "Env & Configuration", emoji: "⚙️" },
] as const;

export const PERSONAS = [
  {
    key: "vibe_coder",
    emoji: "🧑‍💻",
    label: "Vibe Coder",
    tagline: "I built this with AI. Teach me how it actually works.",
    learnPoints: [
      "What each file does and why it exists",
      "How data flows between components",
      "What happens when things break",
    ],
  },
  {
    key: "new_engineer",
    emoji: "👨‍💼",
    label: "New Engineer",
    tagline: "I just joined this team. Onboard me fast.",
    learnPoints: [
      "Architecture decisions and their tradeoffs",
      "How to set up and run everything locally",
      "Where to make your first contribution",
    ],
  },
  {
    key: "product_manager",
    emoji: "📊",
    label: "Product Manager",
    tagline: "No code. Just show me what this system does.",
    learnPoints: [
      "What the system does at a high level",
      "How users interact with each feature",
      "Key dependencies and their business impact",
    ],
  },
  {
    key: "security_auditor",
    emoji: "🔒",
    label: "Security Auditor",
    tagline: "Show me the risks and how data flows.",
    learnPoints: [
      "Authentication and authorization patterns",
      "Data flow and sensitive information handling",
      "Third-party dependencies and attack surface",
    ],
  },
] as const;
