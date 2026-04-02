import type { TargetAudience } from "../prompts";

export interface Abstraction {
  name: string;
  description: string;
  file_indices: number[];
  file_paths?: string[];
}

export interface Relationship {
  from: string;
  to: string;
  relation: string;
  description: string;
}

export interface OrderedChapter {
  index: number;
  title: string;
  learningObjective: string;
  estimatedMinutes: number;
  abstractionRef?: string;
  focusAreas?: string[];
  chapterType?:
    | "overview"
    | "setup"
    | "abstraction"
    | "dependencies"
    | "troubleshooting";
}

export interface ChapterResult {
  index: number;
  title: string;
  learningObjective?: string;
  estimatedMinutes?: number;
  focusAreas?: string[];
  abstractionRef?: string;
  blocks: unknown[];
  regenerated?: boolean;
}

export interface PipelineConfig {
  audience: TargetAudience;
  depth: "quick" | "full" | "deep";
  focusAreas: string[];
  customContext?: string;
}
