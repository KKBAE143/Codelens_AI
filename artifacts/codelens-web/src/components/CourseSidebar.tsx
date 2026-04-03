"use client";

import { useState, useEffect, type ReactNode } from "react";

interface V2Module {
  title: string;
  estimatedMinutes?: number | null;
  focusAreas?: string[];
  blocks: Array<{ type: string }>;
  learningObjective?: string;
}

function ProgressRing({ percent, size = 24, stroke = 2.5 }: { percent: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--bg-tertiary)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={percent >= 100 ? "var(--teal)" : "var(--accent)"} strokeWidth={stroke} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.4s ease" }} />
    </svg>
  );
}

interface ModuleFlashcardInfo {
  total: number;
  due: number;
}

interface ModuleFlashcardCounts {
  [moduleIndex: number]: ModuleFlashcardInfo;
}

export interface CourseSidebarProps {
  modules: V2Module[];
  activeIndex: number | null;
  completedModules: number[];
  quizScores?: Map<number, number>;
  showOverview?: boolean;
  onSelect: (i: number | null) => void;
  courseId?: string;
  onOpenFlashcards?: (moduleIndex: number) => void;
  refreshKey?: number;
  header?: ReactNode;
  footer?: ReactNode;
}

export function CourseSidebar({
  modules,
  activeIndex,
  completedModules,
  quizScores,
  showOverview,
  onSelect,
  courseId,
  onOpenFlashcards,
  refreshKey,
  header,
  footer,
}: CourseSidebarProps) {
  const [flashcardCounts, setFlashcardCounts] = useState<ModuleFlashcardCounts>({});

  useEffect(() => {
    if (!courseId) return;
    fetch(`/api/courses/${courseId}/flashcards/counts`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.counts) setFlashcardCounts(data.counts);
      })
      .catch(() => {});
  }, [courseId, refreshKey]);

  return (
    <nav className="v2-module-nav" aria-label="Course modules">
      {header}
      <div className="v2-module-nav-overview">
        <div>
          <div className="v2-module-nav-kicker">Course roadmap</div>
          <div className="v2-module-nav-heading">Track progress, jump between modules, and revisit completed lessons.</div>
        </div>
        <div className="v2-module-nav-overview-stats">
          <span>{completedModules.length}/{modules.length} done</span>
        </div>
      </div>
      <div className="v2-module-nav-list">
      {showOverview && (
        <button
          className={`v2-module-nav-item ${activeIndex === null ? "v2-module-nav-active" : ""}`}
          onClick={() => onSelect(null)}
          aria-current={activeIndex === null ? "step" : undefined}
          aria-label="Overview canvas"
        >
          <div className="v2-module-nav-marker-wrap">
            <ProgressRing percent={activeIndex === null ? 50 : 0} size={24} stroke={2.5} />
            {modules.length > 0 && <span className="v2-module-nav-connector" aria-hidden="true" />}
          </div>
          <div className="v2-module-nav-text">
            <span className="v2-module-nav-label">Overview</span>
            <span className="v2-module-nav-title">Knowledge graph & abstraction map</span>
            <span className="v2-module-nav-time">Separate course canvas</span>
          </div>
          <div className="v2-module-nav-actions">
            <span className={`v2-module-nav-state ${activeIndex === null ? "is-active" : ""}`}>
              {activeIndex === null ? "Current" : "Open"}
            </span>
          </div>
        </button>
      )}
      {modules.map((mod, i) => {
        const isActive = i === activeIndex;
        const isCompleted = completedModules.includes(i);
        const quizScore = quizScores?.get(i);
        const masteryColor = quizScore !== undefined
          ? quizScore >= 80 ? "var(--teal)" : quizScore >= 60 ? "#F59E0B" : "var(--error)"
          : undefined;
        const fcInfo = flashcardCounts[i];
        const hasFlashcards = fcInfo && fcInfo.total > 0;
        const dueCount = fcInfo?.due ?? 0;
        return (
          <button
            key={i}
            className={`v2-module-nav-item ${isActive ? "v2-module-nav-active" : ""} ${isCompleted ? "v2-module-nav-completed" : ""}`}
            onClick={() => onSelect(i)}
            aria-current={isActive ? "step" : undefined}
            aria-label={`Module ${i + 1}: ${mod.title}${isCompleted ? " (completed)" : ""}${quizScore !== undefined ? `, quiz score ${quizScore}%` : ""}`}
          >
            <div className="v2-module-nav-marker-wrap">
              <ProgressRing percent={isCompleted ? 100 : isActive ? 50 : 0} size={24} stroke={2.5} />
              {i < modules.length - 1 && <span className="v2-module-nav-connector" aria-hidden="true" />}
            </div>
            <div className="v2-module-nav-text">
              <span className="v2-module-nav-label">Module {i + 1}</span>
              <span className="v2-module-nav-title">{mod.title}</span>
              <div className="v2-module-nav-meta-row">
                {mod.estimatedMinutes && (
                  <span className="v2-module-nav-time">~{mod.estimatedMinutes} min</span>
                )}
                {hasFlashcards && onOpenFlashcards && (
                  <span
                    className={`v2-module-flashcard-chip ${dueCount > 0 ? "has-due" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenFlashcards(i);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onOpenFlashcards(i); } }}
                    title={dueCount > 0 ? `${dueCount} due of ${fcInfo.total} flashcards` : `${fcInfo.total} flashcard${fcInfo.total !== 1 ? "s" : ""}`}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    {dueCount > 0 ? dueCount : fcInfo.total}
                  </span>
                )}
              </div>
            </div>
            <div className="v2-module-nav-actions">
              {quizScore !== undefined && (
                <span
                  className="v2-mastery-badge"
                  style={{ color: masteryColor, borderColor: masteryColor }}
                  title={`Quiz mastery: ${quizScore}%`}
                >
                  {quizScore}%
                </span>
              )}
              {isCompleted && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              <span className={`v2-module-nav-state ${isActive ? "is-active" : isCompleted ? "is-complete" : ""}`}>
                {isActive ? "Current" : isCompleted ? "Done" : "Open"}
              </span>
            </div>
          </button>
        );
      })}
      </div>
      {footer}
    </nav>
  );
}
