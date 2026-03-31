"use client";

import type { V2Block } from "@/lib/course-types";
import { ErrorBoundary, BlockErrorFallback } from "@/components/ErrorBoundary";
import { TextBlock } from "./TextBlock";
import { CodeBlock } from "./CodeBlock";
import { MermaidBlock } from "./MermaidBlock";
import { QuizBlock } from "./QuizBlock";
import { CalloutBlock } from "./CalloutBlock";
import { FileListBlock } from "./FileListBlock";
import {
  ArchitectureCardBlock,
  DependencyCardBlock,
  EnvVarCardBlock,
  CommandCardBlock,
} from "./CardBlocks";

interface BlockRendererProps {
  block: V2Block;
  githubUrl?: string;
}

function BlockContent({ block, githubUrl }: BlockRendererProps) {
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
    default:
      return null;
  }
}

export function BlockRenderer({ block, githubUrl }: BlockRendererProps) {
  return (
    <ErrorBoundary fallback={<BlockErrorFallback />}>
      <BlockContent block={block} githubUrl={githubUrl} />
    </ErrorBoundary>
  );
}
