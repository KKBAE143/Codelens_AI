"use client";

import { useState, useEffect } from "react";
import type { V2ExerciseBlock } from "@/lib/course-types";

const DIFFICULTY_CONFIG = {
  easy: { label: "Easy", color: "var(--teal)", bg: "var(--teal-light)" },
  medium: { label: "Medium", color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
  hard: { label: "Hard", color: "var(--error)", bg: "rgba(239,68,68,0.1)" },
} as const;

function DumbbellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5h11" />
      <path d="M6.5 17.5h11" />
      <path d="M3 9.5V14.5" />
      <path d="M21 9.5V14.5" />
      <path d="M6.5 6.5V17.5" />
      <path d="M17.5 6.5V17.5" />
      <path d="M3 7V17" />
      <path d="M21 7V17" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

interface ExerciseBlockProps {
  block: V2ExerciseBlock;
  doneKey?: string;
  onDone?: (done: boolean) => void;
  initialDone?: boolean;
}

export function ExerciseBlock({ block, doneKey, onDone, initialDone = false }: ExerciseBlockProps) {
  const [isDone, setIsDone] = useState(initialDone);
  const [hintOpen, setHintOpen] = useState(false);

  useEffect(() => {
    if (!doneKey) return;
    try {
      const stored = localStorage.getItem(doneKey);
      if (stored === "1") setIsDone(true);
    } catch {}
  }, [doneKey]);

  const handleToggleDone = () => {
    const next = !isDone;
    setIsDone(next);
    if (doneKey) {
      try {
        if (next) {
          localStorage.setItem(doneKey, "1");
        } else {
          localStorage.removeItem(doneKey);
        }
      } catch {}
    }
    onDone?.(next);
  };

  const difficulty = block.difficulty ? DIFFICULTY_CONFIG[block.difficulty] : null;

  return (
    <div className={`exercise-block ${isDone ? "exercise-block-done" : ""}`}>
      <div className="exercise-header">
        <div className="exercise-header-left">
          <span className="exercise-icon">
            <DumbbellIcon />
          </span>
          <span className="exercise-label">Exercise</span>
          {difficulty && (
            <span
              className="exercise-difficulty"
              style={{ color: difficulty.color, background: difficulty.bg, borderColor: difficulty.color }}
            >
              {difficulty.label}
            </span>
          )}
        </div>
        <button
          type="button"
          className="exercise-done-toggle"
          onClick={handleToggleDone}
          aria-pressed={isDone}
          title={isDone ? "Mark as not done" : "Mark as done"}
        >
          <span className={`exercise-done-btn ${isDone ? "exercise-done-btn-checked" : ""}`}>
            {isDone ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Done
              </>
            ) : (
              "Mark done"
            )}
          </span>
        </button>
      </div>

      <h4 className="exercise-title">{block.title}</h4>
      <p className="exercise-task">{block.task}</p>

      {block.files && block.files.length > 0 && (
        <div className="exercise-files">
          <div className="exercise-files-label">Files to explore</div>
          <div className="exercise-files-list">
            {block.files.map((f) => {
              const content = (
                <>
                  <span className="exercise-file-icon" aria-hidden="true">
                    <FileIcon />
                  </span>
                  <span className="exercise-file-copy">
                    <span className="exercise-file-path">{f.path}</span>
                    <span className="exercise-file-meta">{f.githubUrl ? "Open source reference" : "Suggested file to inspect"}</span>
                  </span>
                  {f.githubUrl && (
                    <span className="exercise-file-link" aria-hidden="true">
                      <span className="exercise-file-link-label">Open</span>
                      <ExternalLinkIcon />
                    </span>
                  )}
                </>
              );

              return f.githubUrl ? (
                <a
                  key={f.path}
                  href={f.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="exercise-file-item exercise-file-item-link"
                  title={`Open ${f.path} on GitHub`}
                >
                  {content}
                </a>
              ) : (
                <div key={f.path} className="exercise-file-item">
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {block.verificationHint && (
        <div className="exercise-hint">
          <button
            className="exercise-hint-toggle"
            onClick={() => setHintOpen(!hintOpen)}
            aria-expanded={hintOpen}
          >
            <ChevronIcon open={hintOpen} />
            How to verify you got it right
          </button>
          {hintOpen && (
            <div className="exercise-hint-content">
              {block.verificationHint}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
