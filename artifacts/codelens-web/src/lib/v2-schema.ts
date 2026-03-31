import { z } from "zod";

export const v2TextBlockSchema = z.object({
  type: z.literal("text"),
  content: z.string().min(1),
});

export const v2CodeBlockSchema = z.object({
  type: z.literal("code"),
  language: z.string(),
  filePath: z.string().optional(),
  lineStart: z.number().optional(),
  lineEnd: z.number().optional(),
  content: z.string().min(1),
  caption: z.string().optional(),
});

export const v2MermaidBlockSchema = z.object({
  type: z.literal("mermaid"),
  diagramType: z.enum(["flowchart", "sequenceDiagram", "erDiagram", "classDiagram", "graph"]).optional(),
  source: z.string().min(1),
  caption: z.string().optional(),
});

export const v2QuizOptionSchema = z.object({
  text: z.string().min(1),
  correct: z.boolean(),
  explanation: z.string().min(1),
});

export const v2QuizBlockSchema = z.object({
  type: z.literal("quiz"),
  question: z.string().min(1),
  scenario: z.string().optional(),
  options: z.array(v2QuizOptionSchema).min(2),
});

export const v2CalloutBlockSchema = z.object({
  type: z.literal("callout"),
  variant: z.enum(["warning", "tip", "ai-hint", "first-pr", "security", "command"]),
  content: z.string().min(1),
});

export const v2FileListBlockSchema = z.object({
  type: z.literal("file-list"),
  files: z.array(z.object({
    path: z.string(),
    role: z.string(),
    lineCount: z.number().optional(),
    githubUrl: z.string().optional(),
  })).min(1),
});

export const v2ArchitectureCardBlockSchema = z.object({
  type: z.literal("architecture-card"),
  decision: z.string().min(1),
  rationale: z.string().min(1),
  tradeoffs: z.string().min(1),
  alternatives: z.string().optional(),
});

export const v2DependencyCardBlockSchema = z.object({
  type: z.literal("dependency-card"),
  packageName: z.string().min(1),
  purpose: z.string().min(1),
  version: z.string().optional(),
  whatBreaksWithout: z.string().optional(),
  alternatives: z.string().optional(),
});

export const v2EnvVarCardBlockSchema = z.object({
  type: z.literal("env-var-card"),
  varName: z.string().min(1),
  required: z.boolean(),
  purpose: z.string().min(1),
  exampleValue: z.string().optional(),
  whatBreaksWithout: z.string().optional(),
});

export const v2CommandCardBlockSchema = z.object({
  type: z.literal("command-card"),
  command: z.string().min(1),
  when: z.string().min(1),
  expectedOutput: z.string().optional(),
  commonErrors: z.array(z.object({
    error: z.string(),
    fix: z.string(),
  })).optional(),
});

export const v2BlockSchema = z.discriminatedUnion("type", [
  v2TextBlockSchema,
  v2CodeBlockSchema,
  v2MermaidBlockSchema,
  v2QuizBlockSchema,
  v2CalloutBlockSchema,
  v2FileListBlockSchema,
  v2ArchitectureCardBlockSchema,
  v2DependencyCardBlockSchema,
  v2EnvVarCardBlockSchema,
  v2CommandCardBlockSchema,
]);

export const v2ChapterSchema = z.object({
  index: z.number(),
  title: z.string().min(1),
  learningObjective: z.string().optional(),
  estimatedMinutes: z.number().optional(),
  focusAreas: z.array(z.string()).optional(),
  abstractionRef: z.string().optional(),
  regenerated: z.boolean().optional(),
  blocks: z.array(v2BlockSchema).min(1),
});

export const v2CourseSchema = z.object({
  version: z.literal(2),
  repoName: z.string(),
  ownerName: z.string(),
  githubUrl: z.string(),
  persona: z.string(),
  depth: z.enum(["quick", "full", "deep"]),
  totalModules: z.number(),
  estimatedTotalMinutes: z.number(),
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  fileCount: z.number(),
  abstractionCount: z.number(),
  overviewGraph: z.object({
    nodes: z.array(z.object({
      id: z.string(),
      label: z.string(),
      moduleIndex: z.number(),
      connections: z.number(),
      description: z.string().optional(),
      fileCount: z.number().optional(),
    })),
    edges: z.array(z.object({
      from: z.string(),
      to: z.string(),
      relation: z.string(),
      label: z.string().optional(),
    })),
  }).optional(),
  modules: z.array(v2ChapterSchema).min(1),
});

export type V2ChapterInput = z.infer<typeof v2ChapterSchema>;
export type V2CourseInput = z.infer<typeof v2CourseSchema>;
