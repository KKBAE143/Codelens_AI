"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAuth } from "@/hooks/use-auth";
import { BlockRenderer } from "@/components/course-blocks/BlockRenderer";
import {
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
  onSelect,
}: {
  modules: V2Module[];
  activeIndex: number;
  completedModules: number[];
  onSelect: (i: number) => void;
}) {
  return (
    <nav className="v2-module-nav" aria-label="Course modules">
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
            <ProgressRing percent={isCompleted ? 100 : isActive ? 50 : 0} />
            <div className="v2-module-nav-text">
              <span className="v2-module-nav-label">Module {i + 1}</span>
              <span className="v2-module-nav-title">{mod.title}</span>
            </div>
          </button>
        );
      })}
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
}: {
  module: V2Module;
  moduleIndex: number;
  totalModules: number;
  githubUrl: string;
  isCompleted: boolean;
  onComplete: () => void;
  onPrev: () => void;
  onNext: () => void;
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
        <button className="btn-secondary" onClick={onPrev} disabled={moduleIndex === 0} style={{ fontSize: "0.85rem" }}>
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

function OverviewGraphDisplay({ graph, onModuleClick }: { graph: NonNullable<V2CourseData["overviewGraph"]>; onModuleClick: (i: number) => void }) {
  if (!graph.nodes.length) return null;

  return (
    <div className="v2-overview-graph">
      <h3 className="v2-overview-graph-title">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        Abstraction Relationships
      </h3>
      <div className="v2-overview-nodes">
        {graph.nodes.map((node) => (
          <button
            key={node.id}
            className="v2-overview-node"
            onClick={() => onModuleClick(node.moduleIndex)}
            title={`Go to Module ${node.moduleIndex + 1}`}
          >
            <span className="v2-overview-node-label">{node.label}</span>
            <span className="v2-overview-node-connections">
              {node.connections} connection{node.connections !== 1 ? "s" : ""}
            </span>
          </button>
        ))}
      </div>
      {graph.edges.length > 0 && (
        <div className="v2-overview-edges">
          {graph.edges.map((edge, i) => (
            <div key={i} className="v2-overview-edge">
              <span className="v2-overview-edge-from">{graph.nodes.find((n) => n.id === edge.from)?.label || edge.from}</span>
              <span className="v2-overview-edge-arrow">→</span>
              <span className="v2-overview-edge-relation">{edge.label || edge.relation}</span>
              <span className="v2-overview-edge-arrow">→</span>
              <span className="v2-overview-edge-to">{graph.nodes.find((n) => n.id === edge.to)?.label || edge.to}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
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
    if (course?.v2Data) return course.v2Data;
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

  const handleModuleSelect = (i: number) => {
    setActiveModuleIndex(i);
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (!v2Data) return;
    const totalMods = v2Data.totalModules;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveModuleIndex((prev) => Math.min(totalMods - 1, prev + 1));
        mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveModuleIndex((prev) => Math.max(0, prev - 1));
        mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [v2Data]);

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

  const activeModule = v2Data.modules[activeModuleIndex];
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
        <div className="v2-sidebar-header" style={{ display: "flex", flexDirection: "column", gap: "0.25rem", paddingBottom: "0.5rem" }}>
          <Link href="/explore" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem", marginBottom: "0.5rem", width: "max-content", padding: "0.25rem 0.5rem", borderRadius: "var(--radius-sm)", backgroundColor: "var(--bg-secondary)" }}>
            &larr; Explore
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", wordBreak: "break-word" }}>
            <img
              src={`https://github.com/${course.ownerName}.png?size=32`}
              alt={course.ownerName}
              width={24}
              height={24}
              style={{ borderRadius: "var(--radius-full)" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            <a
              href={course.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="v2-repo-link"
              style={{ fontSize: "1rem", lineHeight: 1.2 }}
            >
              <span className="opacity-70">{course.ownerName}/</span>
              <br className="md:hidden" />
              <strong className="text-white font-bold">{course.repoName}</strong>
            </a>
          </div>
          {course.oneLiner && (
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: "0.5rem 0", lineHeight: "1.4" }}>{course.oneLiner}</p>
          )}

          <div className="v2-sidebar-meta" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
            {course.stars != null && course.stars > 0 && (
              <span className="badge" style={{ whiteSpace: "nowrap" }} title="GitHub stars">&#9733; {course.stars >= 1000 ? `${(course.stars / 1000).toFixed(1)}k` : course.stars}</span>
            )}
            {course.difficulty && (
              <span className="badge" style={{ whiteSpace: "nowrap" }}>{course.difficulty}</span>
            )}
            <span className="badge" style={{ whiteSpace: "nowrap" }}>{AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}</span>
            {course.estimatedMinutes && (
              <span className="badge" style={{ whiteSpace: "nowrap" }}>~{course.estimatedMinutes} min</span>
            )}
            {course.viewCount > 0 && (
              <span className="badge" style={{ whiteSpace: "nowrap" }}>{course.viewCount} views</span>
            )}
          </div>
          {course.updatedAt && (
            <p style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", margin: "0.5rem 0 0" }}>
              Last generated {formatTimeAgo(course.updatedAt)}
            </p>
          )}

          <div style={{ margin: "0.75rem 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>
              <span>Progress</span>
              <span>{completionPercent}%</span>
            </div>
            <div style={{ height: 4, background: "var(--bg-tertiary)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${completionPercent}%`, background: completionPercent >= 100 ? "var(--teal)" : "var(--accent)", borderRadius: 4, transition: "width 0.4s ease" }} />
            </div>
          </div>

          <ShareButtons course={course} />
        </div>

        <V2Sidebar
          modules={v2Data.modules}
          activeIndex={activeModuleIndex}
          completedModules={completedModules}
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

        {activeModuleIndex === 0 && v2Data.overviewGraph && (
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
                <OverviewGraphDisplay graph={v2Data.overviewGraph} onModuleClick={handleModuleSelect} />
              </div>
            )}
          </div>
        )}

        {activeModule && (
          <V2Content
            module={activeModule}
            moduleIndex={activeModuleIndex}
            totalModules={totalModules}
            githubUrl={course.githubUrl}
            isCompleted={completedModules.includes(activeModuleIndex)}
            onComplete={() => markModuleComplete(activeModuleIndex)}
            onPrev={() => handleModuleSelect(Math.max(0, activeModuleIndex - 1))}
            onNext={() => handleModuleSelect(Math.min(totalModules - 1, activeModuleIndex + 1))}
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
