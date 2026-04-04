"use client";

import { useState, useCallback, useEffect } from "react";
import type { V2Block, V2ModuleSummaryBlock } from "@/lib/course-types";
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
  doneExercises?: Record<string, boolean>;
  onExerciseDone?: (key: string, done: boolean) => void;
}

interface BlockRendererProps {
  block: V2Block;
  githubUrl?: string;
  exerciseContext?: ExerciseContext;
  courseId?: string;
  moduleTitle?: string;
  beginnerMode?: boolean;
}

function getBlockTextContent(block: V2Block): string {
  switch (block.type) {
    case "text": return block.content.replace(/<[^>]+>/g, " ").slice(0, 2000);
    case "code": return `${block.caption || ""}\n${block.content}`.slice(0, 2000);
    case "callout": return block.content.slice(0, 2000);
    case "quiz": return `${block.question}\n${block.scenario || ""}`.slice(0, 2000);
    default: return "";
  }
}

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

let csrfFetchPromise: Promise<void> | null = null;
function ensureCsrfToken(): Promise<void> {
  if (getCsrfToken()) return Promise.resolve();
  if (!csrfFetchPromise) {
    csrfFetchPromise = fetch("/api/csrf-token", { credentials: "include" })
      .then(() => { csrfFetchPromise = null; })
      .catch(() => { csrfFetchPromise = null; });
  }
  return csrfFetchPromise;
}

function ConfusedButton({ block, courseId, moduleTitle }: { block: V2Block; courseId?: string; moduleTitle?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [explanation, setExplanation] = useState<string | null>(null);

  useEffect(() => {
    ensureCsrfToken();
  }, []);

  const handleClick = useCallback(async () => {
    if (!courseId || state === "loading") return;
    setState("loading");

    try {
      await ensureCsrfToken();
      const token = getCsrfToken();

      const res = await fetch(`/api/courses/${courseId}/explain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token,
        },
        credentials: "include",
        body: JSON.stringify({
          blockContent: getBlockTextContent(block),
          blockType: block.type,
          moduleTitle,
        }),
      });
      const data = await res.json();
      if (data.explanation) {
        setExplanation(data.explanation);
        setState("done");
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }, [block, courseId, moduleTitle, state]);

  if (!courseId) return null;

  return (
    <div className="confused-wrapper">
      {state === "idle" && (
        <button className="confused-btn" onClick={handleClick} title="Get a simpler explanation">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          I&apos;m Confused
        </button>
      )}
      {state === "loading" && (
        <div className="confused-loading">Generating simpler explanation...</div>
      )}
      {state === "done" && explanation && (
        <div className="confused-explanation">
          <div className="confused-explanation-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            Simpler Explanation
          </div>
          <div className="confused-explanation-body">{explanation}</div>
          <button className="confused-dismiss" onClick={() => { setState("idle"); setExplanation(null); }}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

function BlockContent({ block, githubUrl, exerciseContext, courseId, moduleTitle, beginnerMode }: BlockRendererProps) {
  const showConfusedBtn = ["text", "code", "callout"].includes(block.type) && courseId;
  const isAdvancedBlock = block.type === "architecture-card" || block.type === "mermaid" ||
    (block.type === "code" && block.content && block.content.split("\n").length > 20);

  if ("beginnerOnly" in block && (block as { beginnerOnly?: boolean }).beginnerOnly && !beginnerMode) {
    return null;
  }

  if (beginnerMode && isAdvancedBlock) {
    return (
      <details className="beginner-collapsed">
        <summary className="beginner-collapsed-summary">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {block.type === "architecture-card" ? "Architecture Details" :
           block.type === "mermaid" ? "Diagram" : "Detailed Code"} (tap to expand)
        </summary>
        <div className="beginner-collapsed-content">
          <InnerBlockContent block={block} githubUrl={githubUrl} exerciseContext={exerciseContext} />
        </div>
      </details>
    );
  }

  return (
    <>
      <InnerBlockContent block={block} githubUrl={githubUrl} exerciseContext={exerciseContext} />
      {showConfusedBtn && <ConfusedButton block={block} courseId={courseId} moduleTitle={moduleTitle} />}
    </>
  );
}

function InnerBlockContent({ block, githubUrl, exerciseContext }: { block: V2Block; githubUrl?: string; exerciseContext?: ExerciseContext }) {
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
    case "module-summary": {
      const summaryBlock = block as V2ModuleSummaryBlock;
      const bulletItems = summaryBlock.bullets ?? [];
      return (
        <div className="v2-module-summary-card">
          <div className="v2-module-summary-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            {summaryBlock.title ?? "What You Learned"}
          </div>
          <ul className="v2-module-summary-list">
            {bulletItems.map((b, i) => {
              const parts = b.split(/\*\*([^*]+)\*\*/g);
              return (
                <li key={i} className="v2-module-summary-bullet">
                  {parts.map((part, pi) => pi % 2 === 1 ? <strong key={pi}>{part}</strong> : part)}
                </li>
              );
            })}
          </ul>
        </div>
      );
    }
    case "exercise": {
      const doneKey = exerciseContext
        ? `ex-${exerciseContext.courseId}-m${exerciseContext.moduleIndex}-b${exerciseContext.blockIndex}`
        : undefined;
      const initialDone = doneKey ? !!(exerciseContext?.doneExercises?.[doneKey]) : false;
      return (
        <ExerciseBlock
          block={block}
          doneKey={doneKey}
          initialDone={initialDone}
          onDone={
            doneKey && exerciseContext?.onExerciseDone
              ? (done) => exerciseContext.onExerciseDone!(doneKey, done)
              : undefined
          }
        />
      );
    }
    default:
      return null;
  }
}

export function BlockRenderer({ block, githubUrl, exerciseContext, courseId, moduleTitle, beginnerMode }: BlockRendererProps) {
  return (
    <ErrorBoundary fallback={<BlockErrorFallback />}>
      <BlockContent block={block} githubUrl={githubUrl} exerciseContext={exerciseContext} courseId={courseId} moduleTitle={moduleTitle} beginnerMode={beginnerMode} />
    </ErrorBoundary>
  );
}
