"use client";

import type { V2Block } from "@/lib/course-types";
import { ErrorBoundary, BlockErrorFallback } from "@/components/ErrorBoundary";
import { TextBlock } from "./TextBlock";
import { CodeBlock } from "./CodeBlock";
import { MermaidBlock } from "./MermaidBlock";
import { QuizBlock } from "./QuizBlock";
import { CalloutBlock } from "./CalloutBlock";
import { FileListBlock } from "./FileListBlock";
import { ExerciseBlock } from "./ExerciseBlock";
import {
  ArchitectureCardBlock,
  DependencyCardBlock,
  EnvVarCardBlock,
  CommandCardBlock,
} from "./CardBlocks";

export interface ExerciseContext {
  courseId: string;
  moduleIndex: number;
  blockIndex: number;
}

interface BlockRendererProps {
  block: V2Block;
  githubUrl?: string;
  exerciseContext?: ExerciseContext;
}

function BlockContent({ block, githubUrl, exerciseContext }: BlockRendererProps) {
  switch (block.type) {
    case "text":
      return <TextBlock block={block} />;
    case "code":
      return <CodeBlock block={block} githubUrl={githubUrl} />;
    case "mermaid":
      return <MermaidBlock block={block} />;
    case "quiz":
      return <QuizBlock block={block} />;
    case "callout":
      return <CalloutBlock block={block} />;
    case "file-list":
      return <FileListBlock block={block} />;
    case "architecture-card":
      return <ArchitectureCardBlock block={block} />;
    case "dependency-card":
      return <DependencyCardBlock block={block} />;
    case "env-var-card":
      return <EnvVarCardBlock block={block} />;
    case "command-card":
      return <CommandCardBlock block={block} />;
    case "exercise": {
      const doneKey = exerciseContext
        ? `ex-${exerciseContext.courseId}-m${exerciseContext.moduleIndex}-b${exerciseContext.blockIndex}`
        : undefined;
      return <ExerciseBlock block={block} doneKey={doneKey} />;
    }
    default:
      return null;
  }
}

export function BlockRenderer({ block, githubUrl, exerciseContext }: BlockRendererProps) {
  return (
    <ErrorBoundary fallback={<BlockErrorFallback />}>
      <BlockContent block={block} githubUrl={githubUrl} exerciseContext={exerciseContext} />
    </ErrorBoundary>
  );
}
