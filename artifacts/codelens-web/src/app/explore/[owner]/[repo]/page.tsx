"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/use-auth";
import { AbstractionMap } from "@/components/course-blocks/AbstractionMap";
import { BlockRenderer } from "@/components/course-blocks/BlockRenderer";
import {
  normalizeV2CourseData,
  parseV2Course,
  type V2CourseData,
  type V2Module,
} from "@/lib/course-types";

const KnowledgeGraph = dynamic(
  () => import("@/components/course-blocks/KnowledgeGraph").then((m) => m.KnowledgeGraph),
  { ssr: false }
);

const AUDIENCE_LABELS: Record<string, string> = {
  vibe_coder: "Vibe Coder",
  new_engineer: "New Engineer",
  product_manager: "PM",
  security_auditor: "Security",
};

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths === 1 ? "1 month ago" : `${diffMonths} months ago`;
}

interface PublicCourse {
  id: string;
  repoName: string;
  ownerName: string;
  githubUrl: string;
  targetAudience: string;
  techStack: { languages: string[]; frameworks: string[] } | null;
  oneLiner: string | null;
  difficulty: string | null;
  estimatedMinutes: number | null;
  moduleCount: number | null;
  stars: number | null;
  focusAreas: string[] | null;
  html: string | null;
  v2Data?: V2CourseData | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
}

async function fetchPublicCourse(owner: string, repo: string): Promise<{ course: PublicCourse }> {
  const res = await fetch(`/api/courses/explore/${owner}/${repo}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Not found" }));
    throw new Error(data.error || "Course not found");
  }
  return res.json();
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

function V2Sidebar({
  modules,
  activeIndex,
  completedModules,
  showOverview,
  onSelect,
}: {
  modules: V2Module[];
  activeIndex: number | null;
  completedModules: number[];
  showOverview?: boolean;
  onSelect: (i: number | null) => void;
}) {
  return (
    <nav className="v2-module-nav" aria-label="Course modules">
      <div className="v2-module-nav-overview">
        <div>
          <div className="v2-module-nav-kicker">Course roadmap</div>
          <div className="v2-module-nav-heading">Follow the modules in order or jump to a concept you need.</div>
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
        >
          <div className="v2-module-nav-marker-wrap">
            <ProgressRing percent={activeIndex === null ? 50 : 0} />
            {modules.length > 0 && <span className="v2-module-nav-connector" aria-hidden="true" />}
          </div>
          <div className="v2-module-nav-text">
            <span className="v2-module-nav-label">Overview</span>
            <span className="v2-module-nav-title">Knowledge graph & abstraction map</span>
            <span className="v2-module-nav-time">Separate course canvas</span>
          </div>
          <span className={`v2-module-nav-state ${activeIndex === null ? "is-active" : ""}`}>
            {activeIndex === null ? "Current" : "Open"}
          </span>
        </button>
      )}
      {modules.map((mod, i) => {
        const isActive = i === activeIndex;
        const isCompleted = completedModules.includes(i);
        return (
          <button
            key={i}
            className={`v2-module-nav-item ${isActive ? "v2-module-nav-active" : ""} ${isCompleted ? "v2-module-nav-completed" : ""}`}
            onClick={() => onSelect(i)}
            aria-current={isActive ? "step" : undefined}
          >
            <div className="v2-module-nav-marker-wrap">
              <ProgressRing percent={isCompleted ? 100 : isActive ? 50 : 0} />
              {i < modules.length - 1 && <span className="v2-module-nav-connector" aria-hidden="true" />}
            </div>
            <div className="v2-module-nav-text">
              <span className="v2-module-nav-label">Module {i + 1}</span>
              <span className="v2-module-nav-title">{mod.title}</span>
              <span className="v2-module-nav-time">{mod.estimatedMinutes ? `~${mod.estimatedMinutes} min` : "Guided lesson"}</span>
            </div>
            <span className={`v2-module-nav-state ${isActive ? "is-active" : isCompleted ? "is-complete" : ""}`}>
              {isActive ? "Current" : isCompleted ? "Done" : "Open"}
            </span>
          </button>
        );
      })}
      </div>
    </nav>
  );
}

function V2Content({
  module: mod,
  moduleIndex,
  totalModules,
  githubUrl,
  isCompleted,
  onComplete,
  onPrev,
  onNext,
  hasOverview,
}: {
  module: V2Module;
  moduleIndex: number;
  totalModules: number;
  githubUrl: string;
  isCompleted: boolean;
  onComplete: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasOverview: boolean;
}) {
  return (
    <article className="v2-module-content">
      <header className="v2-module-header">
        <span className="v2-module-index">Module {moduleIndex + 1} of {totalModules}</span>
        <h2 className="v2-module-title">{mod.title}</h2>
        {mod.learningObjective && (
          <p className="v2-module-objective">{mod.learningObjective}</p>
        )}
        <div className="v2-module-meta">
          {mod.estimatedMinutes && (
            <span className="v2-module-meta-item">~{mod.estimatedMinutes} min</span>
          )}
          {mod.focusAreas && mod.focusAreas.length > 0 && (
            <div className="v2-module-focus-tags">
              {mod.focusAreas.map((fa) => (
                <span key={fa} className="badge" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>{fa}</span>
              ))}
            </div>
          )}
        </div>
      </header>
      <div className="v2-blocks">
        {mod.blocks.map((block, bi) => (
          <div key={bi} className="v2-block-wrapper">
            <BlockRenderer block={block} githubUrl={githubUrl} />
          </div>
        ))}
      </div>
      <footer className="v2-module-footer">
        <button className="btn-secondary" onClick={onPrev} disabled={moduleIndex === 0 && !hasOverview} style={{ fontSize: "0.85rem" }}>
          Previous
        </button>
        <div className="v2-module-footer-center">
          {!isCompleted ? (
            <button className="btn-primary" onClick={onComplete} style={{ fontSize: "0.85rem" }}>
              Mark Complete
            </button>
          ) : (
            <span style={{ color: "var(--teal)", fontWeight: 600, fontSize: "0.85rem" }}>
              Completed
            </span>
          )}
        </div>
        <button className="btn-secondary" onClick={onNext} disabled={moduleIndex === totalModules - 1} style={{ fontSize: "0.85rem" }}>
          Next
        </button>
      </footer>
    </article>
  );
}

function getVisitorId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem("codelens_visitor_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("codelens_visitor_id", id);
  }
  return id;
}


function ShareButtons({ course }: { course: PublicCourse }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? window.location.href : "";
  const text = `Check out this AI-generated course for ${course.ownerName}/${course.repoName} on CodeLens AI`;

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="v2-share-panel">
      <div className="v2-share-panel-head">
        <span className="v2-share-panel-kicker">Share course</span>
        <p>Send this learning path to teammates or save it for later.</p>
      </div>
      <div className="v2-share-row">
      <button onClick={handleCopy} className="v2-share-btn">
        {copied ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy Link
          </>
        )}
      </button>
      <a
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="v2-share-btn"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
        Share on X
      </a>
      <a
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="v2-share-btn"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z" />
          <circle cx="4" cy="4" r="2" />
        </svg>
        LinkedIn
      </a>
      </div>
    </div>
  );
}

export default function PublicCourseViewer() {
  const params = useParams();
  const owner = params.owner as string;
  const repo = params.repo as string;
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated, login } = useAuth();

  const [completedModules, setCompletedModules] = useState<number[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeModuleIndex, setActiveModuleIndex] = useState<number | null>(null);
  const [showSignInCta, setShowSignInCta] = useState(false);
  const [overviewTab, setOverviewTab] = useState<"graph" | "diagram">("graph");

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-course", owner, repo],
    queryFn: () => fetchPublicCourse(owner, repo),
    enabled: !!owner && !!repo,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const course = data?.course ?? null;

  const v2Data: V2CourseData | null = useMemo(() => {
    if (course?.v2Data) return normalizeV2CourseData(course.v2Data);
    if (!course?.html) return null;
    return parseV2Course(course.html);
  }, [course?.v2Data, course?.html]);

  useEffect(() => {
    if (!course) return;
    const visitorId = getVisitorId();
    fetch(`/api/courses/${course.id}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId }),
    }).catch(() => {});
  }, [course]);

  useEffect(() => {
    if (!course) return;
    const storageKey = `codelens_progress_${course.id}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setCompletedModules(parsed);
      } catch {}
    }
  }, [course]);

  const markModuleComplete = useCallback((moduleIndex: number) => {
    if (!course) return;
    setCompletedModules((prev) => {
      if (prev.includes(moduleIndex)) return prev;
      const updated = [...prev, moduleIndex];
      localStorage.setItem(`codelens_progress_${course.id}`, JSON.stringify(updated));
      if (!isAuthenticated) {
        setShowSignInCta(true);
      }
      return updated;
    });
  }, [course, isAuthenticated]);

  const handleModuleSelect = (i: number | null) => {
    setActiveModuleIndex(i);
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (!v2Data) return;
    const totalMods = v2Data.totalModules;
    const hasOverview = !!v2Data.overviewGraph;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveModuleIndex((prev) => prev === null ? 0 : Math.min(totalMods - 1, prev + 1));
        mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveModuleIndex((prev) => {
          if (prev === null) return null;
          if (prev === 0) return hasOverview ? null : 0;
          return prev - 1;
        });
        mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [v2Data]);

  useEffect(() => {
    if (v2Data?.overviewGraph) return;
    if (activeModuleIndex === null) setActiveModuleIndex(0);
  }, [activeModuleIndex, v2Data?.overviewGraph]);

  if (isLoading) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="skeleton" style={{ width: 300, height: 24, margin: "0 auto 1rem" }} />
          <div className="skeleton" style={{ width: 200, height: 16, margin: "0 auto" }} />
        </div>
      </main>
    );
  }

  if (error || !course) {
    const repoUrl = `https://github.com/${owner}/${repo}`;
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1.25rem", padding: "2rem" }}>
        <div style={{ width: 56, height: 56, borderRadius: "var(--radius-full)", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
          </svg>
        </div>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", textAlign: "center" }}>
          No course yet for <span style={{ color: "var(--accent)" }}>{owner}/{repo}</span>
        </h2>
        <p style={{ color: "var(--text-secondary)", textAlign: "center", maxWidth: 420 }}>
          Be the first to generate an AI-powered interactive course for this repository.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
          <Link
            href={`/?repo=${encodeURIComponent(repoUrl)}`}
            className="btn-primary"
            style={{ textDecoration: "none", fontSize: "0.9rem", padding: "0.625rem 1.25rem" }}
          >
            Generate Course for {owner}/{repo}
          </Link>
          <Link href="/explore" className="btn-secondary" style={{ textDecoration: "none", fontSize: "0.9rem", padding: "0.625rem 1.25rem" }}>
            Browse Courses
          </Link>
        </div>
      </main>
    );
  }

  if (!v2Data) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem" }}>Unsupported Format</h2>
        <p style={{ color: "var(--text-secondary)" }}>This course uses an older format that cannot be displayed here.</p>
        <Link href="/explore" className="btn-secondary" style={{ textDecoration: "none" }}>
          Browse Courses
        </Link>
      </main>
    );
  }

  const activeModule = activeModuleIndex === null ? null : v2Data.modules[activeModuleIndex];
  const totalModules = v2Data.totalModules;
  const completionPercent = Math.round((completedModules.length / totalModules) * 100);
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/explore/${course.ownerName}/${course.repoName}`;

  return (
    <div className="v2-layout v2-public-layout">
      <div className="course-topbar" style={{
        height: 48,
        background: "var(--code-bg)",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 1rem",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
          <Link href="/explore" className="v2-topbar-back" style={{ textDecoration: "none" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="v2-topbar-back-text">Explore</span>
          </Link>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>|</span>
          <code style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.9)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {course.ownerName}/{course.repoName}
          </code>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="v2-topbar-audience" style={{ background: "rgba(255,255,255,0.15)", padding: "0.125rem 0.5rem", borderRadius: "var(--radius-full)", color: "rgba(255,255,255,0.7)", fontSize: "0.75rem" }}>
            {AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}
          </span>
          <div className="v2-topbar-progress" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div style={{ width: 100, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${completionPercent}%`, background: "var(--teal)", borderRadius: 2, transition: "width 0.3s ease" }} />
            </div>
            <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.6)" }}>
              {completedModules.length}/{totalModules}
            </span>
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(shareUrl)}
            className="v2-topbar-share-btn"
            aria-label="Copy course link"
            title="Copy course link"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span className="v2-topbar-share-text">Copy Link</span>
          </button>
          <button
            onClick={() => setShowSidebar((prev) => !prev)}
            className="v2-topbar-sidebar-btn"
            aria-label={showSidebar ? "Hide sidebar" : "Show sidebar"}
            title={showSidebar ? "Hide sidebar" : "Show sidebar"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
      <div className={`v2-sidebar ${showSidebar ? "" : "v2-sidebar-collapsed"}`}>
        <div className="v2-sidebar-header v2-sidebar-header-public">
          <Link href="/explore" className="v2-sidebar-backlink">
            &larr; Explore
          </Link>
          <div className="v2-sidebar-repo-card">
          <div className="v2-sidebar-repo-row">
            <img
              src={`https://github.com/${course.ownerName}.png?size=32`}
              alt={course.ownerName}
              width={36}
              height={36}
              className="v2-sidebar-avatar"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <a
              href={course.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="v2-repo-link"
            >
              <span className="v2-repo-owner">{course.ownerName}/</span>
              <strong className="v2-repo-name">{course.repoName}</strong>
            </a>
          </div>
          <div className="v2-sidebar-meta-grid">
            <div className="v2-sidebar-meta-card">
              <span className="v2-sidebar-meta-value">{AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}</span>
              <span className="v2-sidebar-meta-label">Audience</span>
            </div>
            <div className="v2-sidebar-meta-card">
              <span className="v2-sidebar-meta-value">{course.estimatedMinutes ? `~${course.estimatedMinutes}m` : "Self-paced"}</span>
              <span className="v2-sidebar-meta-label">Duration</span>
            </div>
            <div className="v2-sidebar-meta-card">
              <span className="v2-sidebar-meta-value">{course.viewCount}</span>
              <span className="v2-sidebar-meta-label">Views</span>
            </div>
          </div>
          {course.oneLiner && (
            <p className="v2-sidebar-summary">{course.oneLiner}</p>
          )}

          <div className="v2-sidebar-meta">
            {course.stars != null && course.stars > 0 && (
              <span className="badge" style={{ whiteSpace: "nowrap" }} title="GitHub stars">&#9733; {course.stars >= 1000 ? `${(course.stars / 1000).toFixed(1)}k` : course.stars}</span>
            )}
            {course.difficulty && (
              <span className="badge" style={{ whiteSpace: "nowrap" }}>{course.difficulty}</span>
            )}
          </div>
          {course.updatedAt && (
            <p className="v2-sidebar-updated">
              Last generated {formatTimeAgo(course.updatedAt)}
            </p>
          )}

          <div className="v2-sidebar-progress-card">
            <div className="v2-sidebar-progress-head">
              <span>Progress</span>
              <span>{completionPercent}%</span>
            </div>
            <div className="v2-sidebar-progress-bar">
              <div style={{ height: "100%", width: `${completionPercent}%`, background: completionPercent >= 100 ? "var(--teal)" : "var(--accent)", borderRadius: 999, transition: "width 0.4s ease" }} />
            </div>
            <div className="v2-sidebar-progress-caption">{completedModules.length} of {totalModules} modules completed</div>
          </div>

          <ShareButtons course={course} />
          </div>
        </div>

        <V2Sidebar
          modules={v2Data.modules}
          activeIndex={activeModuleIndex}
          completedModules={completedModules}
          showOverview={!!v2Data.overviewGraph}
          onSelect={handleModuleSelect}
        />
      </div>

      <div className="v2-main">
        <div className="v2-main-scroll" ref={mainScrollRef}>
        {showSignInCta && !isAuthenticated && (
          <div style={{
            background: "linear-gradient(90deg, var(--accent-light), #FFF3E0)",
            padding: "0.75rem 1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            borderBottom: "1px solid var(--accent)",
            flexShrink: 0,
          }}>
            <p style={{ fontSize: "0.85rem", color: "var(--text-primary)", margin: 0 }}>
              Sign in to save your progress and track completed modules across sessions.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
              <button onClick={login} className="btn-primary" style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}>
                Sign In
              </button>
              <button onClick={() => setShowSignInCta(false)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "0.8rem" }}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {activeModuleIndex === null && v2Data.overviewGraph && (
          <div className="v2-overview-section">
            <div className="v2-overview-tabs" role="tablist" aria-label="Overview visualization tabs">
              <button
                id="public-tab-graph"
                className={`v2-overview-tab ${overviewTab === "graph" ? "v2-overview-tab-active" : ""}`}
                onClick={() => setOverviewTab("graph")}
                role="tab"
                aria-selected={overviewTab === "graph"}
                aria-controls="public-tabpanel-graph"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Knowledge Graph
              </button>
              <button
                id="public-tab-diagram"
                className={`v2-overview-tab ${overviewTab === "diagram" ? "v2-overview-tab-active" : ""}`}
                onClick={() => setOverviewTab("diagram")}
                role="tab"
                aria-selected={overviewTab === "diagram"}
                aria-controls="public-tabpanel-diagram"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                </svg>
                Abstraction Map
              </button>
            </div>

            {overviewTab === "graph" ? (
              <div id="public-tabpanel-graph" role="tabpanel" aria-labelledby="public-tab-graph">
                <KnowledgeGraph overviewGraph={v2Data.overviewGraph} onModuleClick={handleModuleSelect} />
              </div>
            ) : (
              <div id="public-tabpanel-diagram" role="tabpanel" aria-labelledby="public-tab-diagram">
                <AbstractionMap graph={v2Data.overviewGraph} onModuleClick={handleModuleSelect} modules={v2Data.modules} />
              </div>
            )}
          </div>
        )}

        {activeModuleIndex !== null && activeModule && (
          <V2Content
            module={activeModule}
            moduleIndex={activeModuleIndex}
            totalModules={totalModules}
            githubUrl={course.githubUrl}
            isCompleted={completedModules.includes(activeModuleIndex)}
            onComplete={() => markModuleComplete(activeModuleIndex)}
            onPrev={() => handleModuleSelect(activeModuleIndex === 0 ? (v2Data.overviewGraph ? null : 0) : activeModuleIndex - 1)}
            onNext={() => handleModuleSelect(Math.min(totalModules - 1, activeModuleIndex + 1))}
            hasOverview={!!v2Data.overviewGraph}
          />
        )}

        <div style={{ textAlign: "center", padding: "2rem 0", borderTop: "1px solid var(--border-color)", marginTop: "2rem" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
            This course was generated by CodeLens AI
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            {!isAuthenticated && (
              <button onClick={login} className="btn-primary" style={{ fontSize: "0.85rem" }}>
                Sign in to Save Progress
              </button>
            )}
            <Link href="/" className={isAuthenticated ? "btn-primary" : "btn-secondary"} style={{ textDecoration: "none", fontSize: "0.85rem" }}>
              Generate a Course for Your Repo
            </Link>
          </div>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}
