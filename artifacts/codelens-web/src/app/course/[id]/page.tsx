"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/components/Toast";
import dynamic from "next/dynamic";
import { BlockRenderer } from "@/components/course-blocks/BlockRenderer";
import { AbstractionMap } from "@/components/course-blocks/AbstractionMap";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { FlashcardReview, FlashcardDueBanner } from "@/components/FlashcardReview";
import { PracticeMode } from "@/components/PracticeMode";
import { CourseWizard } from "@/components/CourseWizard";
import {
  normalizeV2CourseData,
  parseV2Course,
  type V2Block,
  type V2CourseData,
  type V2Module,
  type V2QuizBlock,
} from "@/lib/course-types";

const KnowledgeGraph = dynamic(
  () =>
    import("@/components/course-blocks/KnowledgeGraph").then(
      (m) => m.KnowledgeGraph
    ),
  { ssr: false }
);

const AUDIENCE_LABELS: Record<string, string> = {
  vibe_coder: "Vibe Coder",
  new_engineer: "New Engineer",
  product_manager: "PM",
  security_auditor: "Security",
};

interface ChangesSince {
  summary: string;
  changedFiles: string[];
  addedFiles: string[];
  modifiedFiles: string[];
  removedFiles: string[];
  previousVersionId: string;
  detectedAt: string;
}

interface WebhookInfo {
  autoRegenerate: boolean;
  lastTriggeredAt: string | null;
}

interface CourseData {
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
  html: string | null;
  v2Data?: V2CourseData | null;
  version: number;
  changesSince: ChangesSince | null;
  shareToken: string | null;
  isPublic: boolean;
  createdBy: string | null;
}

async function fetchCourse(id: string): Promise<{ course: CourseData; webhook: WebhookInfo | null }> {
  const res = await fetch(`/api/courses/${id}`, { credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: "Course not found" }));
    throw new Error(data.error || "Course not found");
  }
  return res.json();
}

function ProgressRing({ percent, size = 28, stroke = 3 }: { percent: number; size?: number; stroke?: number }) {
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

function ReadingProgressBar({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight - el.clientHeight;
      if (scrollHeight > 0) {
        setProgress(Math.min(100, (scrollTop / scrollHeight) * 100));
      }
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [scrollRef]);

  return (
    <div className="v2-reading-progress">
      <div className="v2-reading-progress-bar" style={{ width: `${progress}%` }} />
    </div>
  );
}

function V2ModuleSidebar({
  modules,
  activeIndex,
  completedModules,
  quizScores,
  showOverview,
  onSelect,
}: {
  modules: V2Module[];
  activeIndex: number | null;
  completedModules: number[];
  quizScores: Map<number, number>;
  showOverview?: boolean;
  onSelect: (i: number | null) => void;
}) {
  return (
    <nav className="v2-module-nav" aria-label="Course modules">
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
        const quizScore = quizScores.get(i);
        const masteryColor = quizScore !== undefined
          ? quizScore >= 80 ? "var(--teal)" : quizScore >= 60 ? "#F59E0B" : "var(--error)"
          : undefined;
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
              {mod.estimatedMinutes && (
                <span className="v2-module-nav-time">~{mod.estimatedMinutes} min</span>
              )}
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
    </nav>
  );
}

function V2ModuleContent({
  module: mod,
  moduleIndex,
  totalModules,
  githubUrl,
  courseId,
  isCompleted,
  quizScore,
  onComplete,
  onPrev,
  onNext,
  onPractice,
  hasOverview,
  doneExercises,
  onExerciseDone,
}: {
  module: V2Module;
  moduleIndex: number;
  totalModules: number;
  githubUrl: string;
  courseId: string;
  isCompleted: boolean;
  quizScore?: number;
  onComplete: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPractice: () => void;
  hasOverview: boolean;
  doneExercises?: Record<string, boolean>;
  onExerciseDone?: (key: string, done: boolean) => void;
}) {
  const quizBlocks = mod.blocks.filter((b): b is V2QuizBlock => b.type === "quiz");
  const quizCount = quizBlocks.length;
  const estimatedQuizMinutes = Math.ceil(quizCount * 0.75);
  const masteryColor = quizScore !== undefined
    ? quizScore >= 80 ? "var(--teal)" : quizScore >= 60 ? "#F59E0B" : "var(--error)"
    : undefined;

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
            <span className="v2-module-meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 3 }}>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              ~{mod.estimatedMinutes} min
            </span>
          )}
          {quizCount > 0 && (
            <button
              className="v2-practice-btn"
              onClick={onPractice}
              title={`Practice quiz with ${quizCount} question${quizCount !== 1 ? "s" : ""}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Practice Quiz
              <span className="v2-practice-btn-meta">{quizCount}Q · ~{estimatedQuizMinutes}m</span>
              {quizScore !== undefined && (
                <span className="v2-practice-btn-score" style={{ color: masteryColor }}>
                  Best: {quizScore}%
                </span>
              )}
            </button>
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

      {mod.blocks.length >= 8 && (
        <FloatingTOC blocks={mod.blocks} />
      )}

      <div className="v2-blocks">
        {mod.blocks.map((block, bi) => (
          <div key={bi} id={`toc-block-${bi}`} className="v2-block-wrapper">
            <BlockRenderer
              block={block}
              githubUrl={githubUrl}
              exerciseContext={block.type === "exercise" ? {
                courseId,
                moduleIndex,
                blockIndex: bi,
                doneExercises,
                onExerciseDone,
              } : undefined}
            />
          </div>
        ))}
      </div>

      <footer className="v2-module-footer">
        <button
          className="v2-nav-btn"
          onClick={onPrev}
          disabled={moduleIndex === 0 && !hasOverview}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Previous
        </button>

        <div className="v2-module-footer-center">
          {!isCompleted ? (
            <button className="btn-primary" onClick={onComplete} style={{ fontSize: "0.85rem" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Mark Complete
            </button>
          ) : (
            <span style={{ color: "var(--teal)", fontWeight: 600, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              Completed
            </span>
          )}
        </div>

        <button
          className="v2-nav-btn"
          onClick={onNext}
          disabled={moduleIndex === totalModules - 1}
        >
          Next
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </footer>
    </article>
  );
}

const CONFETTI_COLORS = ["#FF6B3D", "#2EBF8C", "#F0B429", "#6C63FF", "#FF4D8B", "#00B4D8"];
const CONFETTI_POSITIONS = [5, 12, 19, 26, 33, 40, 47, 54, 61, 68, 75, 82, 89, 96, 8, 22, 36, 50, 64, 78];
const CONFETTI_DELAYS = [0, 0.15, 0.3, 0.1, 0.25, 0.4, 0.05, 0.35, 0.2, 0.45, 0.12, 0.28, 0.08, 0.38, 0.18, 0.32, 0.22, 0.42, 0.06, 0.48];

function CompletionModal({
  repoName,
  ownerName,
  shareUrl,
  onClose,
}: {
  repoName: string;
  ownerName: string;
  shareUrl: string | null;
  onClose: () => void;
}) {
  const tweetText = `Just finished the AI-generated course for ${ownerName}/${repoName} on CodeLens AI! 🎓`;
  const twitterHref = shareUrl
    ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`
    : `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Course completed">
      <div className="modal-content celebration-modal" onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>
        <button className="celebration-close" onClick={onClose} aria-label="Close">×</button>
        <div className="celebration-confetti" aria-hidden="true">
          {CONFETTI_POSITIONS.map((left, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${left}%`,
                backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${CONFETTI_DELAYS[i]}s`,
                borderRadius: i % 3 === 0 ? "50%" : i % 3 === 1 ? "2px" : "1px",
                width: 8 + (i % 4) * 2,
                height: 8 + (i % 3) * 2,
              }}
            />
          ))}
        </div>
        <div className="celebration-body">
          <div className="celebration-icon">🎓</div>
          <h2 className="celebration-title">Course Complete!</h2>
          <p className="celebration-subtitle">
            You&apos;ve finished all modules of <strong>{ownerName}/{repoName}</strong>. Great work!
          </p>
          <div className="celebration-actions">
            <a
              href={twitterHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ textDecoration: "none", justifyContent: "center" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Share your achievement
            </a>
            <button className="btn-secondary" onClick={onClose} style={{ justifyContent: "center" }}>
              Continue Learning
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getBlockHeading(block: V2Block, index: number): string {
  if (block.type === "text") {
    const match = block.content.match(/<h[23][^>]*>([^<]+)<\/h[23]>/);
    if (match) return match[1];
    return `Section ${index + 1}`;
  }
  if (block.type === "code") {
    if (block.filePath) return block.filePath.split("/").pop() || "Code";
    return "Code Block";
  }
  if (block.type === "mermaid") return block.caption || "Diagram";
  if (block.type === "quiz") return "Knowledge Check";
  if (block.type === "callout") {
    const map: Record<string, string> = { warning: "Warning", tip: "Tip", "ai-hint": "AI Insight", "first-pr": "First PR", security: "Security", command: "Command" };
    return map[block.variant] || "Note";
  }
  if (block.type === "file-list") return "Files Overview";
  if (block.type === "architecture-card") return "Architecture Decision";
  if (block.type === "dependency-card") return block.packageName;
  if (block.type === "env-var-card") return block.varName;
  if (block.type === "command-card") {
    const cmd = block.command;
    return cmd.length > 28 ? cmd.substring(0, 28) + "…" : cmd;
  }
  if (block.type === "exercise") return block.title || "Exercise";
  return `Block ${index + 1}`;
}

function FloatingTOC({ blocks }: { blocks: V2Block[] }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const elements = blocks.map((_, i) => document.getElementById(`toc-block-${i}`));

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const id = visible[0].target.id;
          const idx = parseInt(id.replace("toc-block-", ""), 10);
          if (!isNaN(idx)) setActiveIndex(idx);
        }
      },
      { rootMargin: "-10% 0px -60% 0px", threshold: 0 },
    );

    elements.forEach((el) => { if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, [blocks]);

  const headings = blocks.map((block, i) => ({ label: getBlockHeading(block, i), index: i }));

  return (
    <nav className="floating-toc" aria-label="On this page">
      <div className="floating-toc-title">On this page</div>
      <ul className="floating-toc-list" role="list">
        {headings.map(({ label, index }) => (
          <li key={index}>
            <button
              className={`floating-toc-item ${activeIndex === index ? "floating-toc-item-active" : ""}`}
              onClick={() => {
                const el = document.getElementById(`toc-block-${index}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                  setActiveIndex(index);
                }
              }}
              title={label}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function MobileMenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseMenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function CourseViewer() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [completedModules, setCompletedModules] = useState<number[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [flashcardDueCount, setFlashcardDueCount] = useState(0);
  const [quizScores, setQuizScores] = useState<Map<number, number>>(new Map());
  const [practiceModuleIndex, setPracticeModuleIndex] = useState<number | null>(null);
  const [celebrationShown, setCelebrationShown] = useState(false);
  const [progressInitialized, setProgressInitialized] = useState(false);
  const [overviewTab, setOverviewTab] = useState<"graph" | "diagram">("graph");
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [webhookToggling, setWebhookToggling] = useState(false);
  const [lastSeenVersion, setLastSeenVersion] = useState<number | null>(null);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [doneExercises, setDoneExercises] = useState<Record<string, boolean>>({});
  const [activeModuleIndex, setActiveModuleIndex] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash;
      if (hash === "#overview") return null;
      const match = hash.match(/^#module-(\d+)$/);
      if (match) return Math.max(0, parseInt(match[1], 10) - 1);
    }
    return null;
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const moduleCountRef = useRef(0);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) login();
  }, [authLoading, isAuthenticated, login]);

  const courseId = params.id as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ["course", courseId],
    queryFn: () => fetchCourse(courseId),
    enabled: isAuthenticated && !!courseId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const course = data?.course ?? null;
  const webhookInfo = data?.webhook ?? null;

  const v2Data: V2CourseData | null = useMemo(() => {
    if (course?.v2Data) return normalizeV2CourseData(course.v2Data);
    if (!course?.html) return null;
    return parseV2Course(course.html);
  }, [course?.v2Data, course?.html]);

  const isV2 = !!v2Data;

  useEffect(() => {
    if (course) {
      moduleCountRef.current = v2Data?.totalModules || course.moduleCount || 0;
      document.title = `${course.ownerName}/${course.repoName} — CodeLens AI`;
    }
  }, [course, v2Data]);

  useEffect(() => {
    if (!courseId || !isAuthenticated) return;
    fetch(`/api/courses/${courseId}/flashcards`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setFlashcardDueCount(data.dueCount ?? 0); })
      .catch(() => {});
  }, [courseId, isAuthenticated]);


  useEffect(() => {
    if (!courseId || !isAuthenticated) return;
    fetch(`/api/courses/${courseId}/progress`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((progressData: {
        completedModules?: number[];
        lastSeenVersion?: number;
        moduleScores?: Record<string, number>;
        wizardConfig?: unknown;
        doneExercises?: Record<string, boolean> | null;
      } | null) => {
        if (progressData?.completedModules?.length) {
          setCompletedModules(progressData.completedModules);
        }
        setLastSeenVersion(typeof progressData?.lastSeenVersion === "number" ? progressData.lastSeenVersion : 0);
        if (progressData?.moduleScores) {
          const m = new Map<number, number>();
          Object.entries(progressData.moduleScores).forEach(([k, v]) => m.set(Number(k), v));
          setQuizScores(m);
        }
        if (progressData?.doneExercises && typeof progressData.doneExercises === "object") {
          setDoneExercises(progressData.doneExercises as Record<string, boolean>);
        }
        const wizardDoneOnServer = !!progressData?.wizardConfig;
        const wizardDoneLocally = (() => { try { return !!localStorage.getItem(`wizard-${courseId}`); } catch { return false; } })();
        if (wizardDoneOnServer && !wizardDoneLocally) {
          try { localStorage.setItem(`wizard-${courseId}`, "done"); } catch {}
        }
        setProgressInitialized(true);
      })
      .catch(() => { setProgressInitialized(true); });
  }, [courseId, isAuthenticated]);

  useEffect(() => {
    if (!progressInitialized || celebrationShown) return;
    const total = v2Data?.totalModules ?? course?.moduleCount ?? 0;
    if (total > 0 && completedModules.length >= total) {
      const storageKey = `celebration-shown-${courseId}`;
      const alreadyAcknowledged = localStorage.getItem(storageKey) === "1";
      if (!alreadyAcknowledged) {
        setShowCelebration(true);
      }
      setCelebrationShown(true);
    }
  }, [completedModules.length, v2Data?.totalModules, course?.moduleCount, progressInitialized, celebrationShown, courseId]);

  useEffect(() => {
    if (!progressInitialized || !isV2) return;
    try {
      const stored = localStorage.getItem(`wizard-${courseId}`);
      if (!stored) setShowWizard(true);
    } catch {}
  }, [progressInitialized, isV2, courseId]);

  useEffect(() => {
    if (course && lastSeenVersion !== null && course.version > lastSeenVersion && course.changesSince) {
      setShowWhatsNew(true);
    }
  }, [course, lastSeenVersion]);

  useEffect(() => {
    if (!course?.html || isV2) return;
    const url = URL.createObjectURL(new Blob([course.html], { type: "text/html" }));
    setIframeSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [course?.html, isV2]);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (iframeRef.current && event.source !== iframeRef.current.contentWindow) return;
    if (!event.data || typeof event.data !== "object") return;

    if (event.data.type === "moduleComplete" && typeof event.data.moduleIndex === "number") {
      markModuleComplete(event.data.moduleIndex);
    }
  }, [courseId]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

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
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", activeModuleIndex === null ? "#overview" : `#module-${activeModuleIndex + 1}`);
    }
  }, [activeModuleIndex]);

  useEffect(() => {
    if (v2Data?.overviewGraph) return;
    if (activeModuleIndex === null) setActiveModuleIndex(0);
  }, [activeModuleIndex, v2Data?.overviewGraph]);

  const markModuleComplete = useCallback((moduleIndex: number) => {
    setCompletedModules((prev) => {
      if (prev.includes(moduleIndex)) return prev;
      const updated = [...prev, moduleIndex];
      fetch(`/api/courses/${courseId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ moduleIndex, totalModules: moduleCountRef.current }),
      }).catch(() => {});
      return updated;
    });
  }, [courseId]);

  const handleCopyShare = () => {
    if (!course) return;
    let url: string;
    if (course.isPublic) {
      url = `${window.location.origin}/explore/${course.ownerName}/${course.repoName}`;
    } else if (course.shareToken) {
      url = `${window.location.origin}/share/${course.shareToken}`;
    } else {
      return;
    }
    navigator.clipboard.writeText(url);
    showToast("Share link copied!", "success");
  };

  const handleDismissWhatsNew = async () => {
    if (!course) return;
    setShowWhatsNew(false);
    setLastSeenVersion(course.version);
    try {
      await fetch(`/api/courses/${courseId}/progress`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ markVersionSeen: course.version }),
      });
    } catch {}
  };

  const handleToggleWebhook = async () => {
    if (!course || webhookToggling) return;
    setWebhookToggling(true);
    try {
      const newState = !webhookInfo?.autoRegenerate;
      const res = await fetch(`/api/courses/${courseId}/webhook`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: newState }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as Record<string, string>).error || "Failed to update auto-update");
      }
      showToast(newState ? "Auto-updates enabled" : "Auto-updates disabled", "success");
      queryClient.invalidateQueries({ queryKey: ["course", courseId] });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to toggle auto-updates", "error");
    } finally {
      setWebhookToggling(false);
    }
  };

  const handleModuleSelect = (i: number | null) => {
    setActiveModuleIndex(i);
    setMobileMenuOpen(false);
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (isLoading || authLoading) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="skeleton" style={{ width: 300, height: 24, margin: "0 auto 1rem" }} />
          <div className="skeleton" style={{ width: 200, height: 16, margin: "0 auto" }} />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "1rem" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", color: "var(--error)" }}>
          {error instanceof Error ? error.message : "Failed to load course"}
        </h2>
        <button className="btn-secondary" onClick={() => router.push("/dashboard")}>
          Back to Dashboard
        </button>
      </main>
    );
  }

  if (!course || (!course.html && !course.v2Data)) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-secondary)" }}>Course content is not available yet.</p>
      </main>
    );
  }

  if (!isV2 && !iframeSrc) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-secondary)" }}>Loading course...</p>
      </main>
    );
  }

  const totalModules = v2Data?.totalModules || course.moduleCount || 0;
  const progress = totalModules ? Math.round((completedModules.length / totalModules) * 100) : 0;

  const celebrationShareUrl = course?.isPublic
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/explore/${course.ownerName}/${course.repoName}`
    : course?.shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${course.shareToken}`
    : null;

  const jsonLd = course ? {
    "@context": "https://schema.org",
    "@type": ["Course", "LearningResource"],
    name: `${course.ownerName}/${course.repoName}`,
    description: course.oneLiner || `AI-generated interactive course for ${course.ownerName}/${course.repoName}`,
    provider: { "@type": "Organization", name: "CodeLens AI" },
    learningResourceType: "interactive course",
    inLanguage: "en",
    ...(course.estimatedMinutes && { timeRequired: `PT${course.estimatedMinutes}M` }),
    ...(course.difficulty && { educationalLevel: course.difficulty }),
    ...(course.moduleCount && { numberOfCredits: course.moduleCount }),
    sourceOrganization: {
      "@type": "Organization",
      name: course.ownerName,
      url: `https://github.com/${course.ownerName}`,
    },
  } : null;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      )}
      {showWizard && course && (
        <CourseWizard
          courseId={courseId}
          repoName={course.repoName}
          ownerName={course.ownerName}
          onComplete={() => setShowWizard(false)}
          onSkip={() => setShowWizard(false)}
        />
      )}
      {showFlashcards && (
        <FlashcardReview
          courseId={courseId}
          onClose={() => {
            setShowFlashcards(false);
            fetch(`/api/courses/${courseId}/flashcards`, { credentials: "include" })
              .then((r) => r.ok ? r.json() : null)
              .then((data) => { if (data) setFlashcardDueCount(data.dueCount ?? 0); })
              .catch(() => {});
          }}
        />
      )}
      {practiceModuleIndex !== null && v2Data?.modules[practiceModuleIndex] && (() => {
        const mod = v2Data.modules[practiceModuleIndex];
        const quizBlocks = mod.blocks.filter((b): b is V2QuizBlock => b.type === "quiz");
        return (
          <PracticeMode
            courseId={courseId}
            moduleIndex={practiceModuleIndex}
            moduleTitle={mod.title}
            quizBlocks={quizBlocks}
            onClose={() => setPracticeModuleIndex(null)}
            onScoreSaved={(modIdx, score) => {
              setQuizScores((prev) => {
                const next = new Map(prev);
                next.set(modIdx, Math.max(prev.get(modIdx) ?? 0, score));
                return next;
              });
            }}
          />
        );
      })()}
      {showCelebration && course && (
        <CompletionModal
          ownerName={course.ownerName}
          repoName={course.repoName}
          shareUrl={celebrationShareUrl}
          onClose={() => {
            setShowCelebration(false);
            try { localStorage.setItem(`celebration-shown-${courseId}`, "1"); } catch {}
          }}
        />
      )}
      <div className="course-topbar" style={{
        height: 48, background: "var(--code-bg)", color: "white",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 1rem", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {isV2 && (
            <button
              className="v2-mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle sidebar menu"
            >
              {mobileMenuOpen ? <CloseMenuIcon /> : <MobileMenuIcon />}
            </button>
          )}
          <button
            onClick={() => router.push("/dashboard")}
            className="v2-topbar-back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span className="v2-topbar-back-text">Dashboard</span>
          </button>
          <span style={{ color: "rgba(255,255,255,0.3)" }}>|</span>
          <code style={{ fontSize: "0.85rem", color: "rgba(255,255,255,0.9)", fontFamily: "var(--font-mono)" }}>
            {course.ownerName}/{course.repoName}
          </code>
          {course.version > 1 && (
            <span style={{ background: "rgba(46,125,50,0.3)", color: "#A5D6A7", padding: "0.1rem 0.4rem", borderRadius: "var(--radius-full)", fontSize: "0.7rem", fontWeight: 600 }}>
              v{course.version}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span className="v2-topbar-audience" style={{ background: "rgba(255,255,255,0.15)", padding: "0.125rem 0.5rem", borderRadius: "var(--radius-full)", color: "rgba(255,255,255,0.7)", fontSize: "0.75rem" }}>
            {AUDIENCE_LABELS[course.targetAudience] || course.targetAudience}
          </span>
          {totalModules > 0 && (
            <div className="v2-topbar-progress" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ width: 100, height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "var(--teal)", borderRadius: 2, transition: "width 0.3s ease" }} />
              </div>
              <span style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.6)" }}>
                {completedModules.length}/{totalModules}
              </span>
            </div>
          )}
          {(course.isPublic || course.shareToken) && (
            <button onClick={handleCopyShare} className="v2-topbar-share-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span className="v2-topbar-share-text">Share</span>
            </button>
          )}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
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

      {showWhatsNew && course.changesSince && (
        <div style={{ background: "linear-gradient(90deg, #E8F5E9, #C8E6C9)", padding: "0.75rem 1rem", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", borderBottom: "1px solid #A5D6A7", flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#2E7D32", marginBottom: "0.25rem", fontFamily: "var(--font-heading)" }}>
              What&apos;s new in version {course.version}
            </div>
            <p style={{ fontSize: "0.8rem", color: "#388E3C", lineHeight: 1.4, margin: 0 }}>
              {course.changesSince.summary}
            </p>
          </div>
          <button onClick={handleDismissWhatsNew} style={{ background: "#2E7D32", color: "white", border: "none", borderRadius: "var(--radius-sm)", padding: "0.375rem 0.75rem", fontSize: "0.8rem", cursor: "pointer", fontFamily: "var(--font-body)", whiteSpace: "nowrap", flexShrink: 0 }}>
            Dismiss
          </button>
        </div>
      )}

      {isV2 && v2Data ? (
        <>
          {isAuthenticated && courseId && flashcardDueCount >= 3 && !showFlashcards && (
            <FlashcardDueBanner courseId={courseId} onClick={() => setShowFlashcards(true)} />
          )}
          <ReadingProgressBar scrollRef={mainScrollRef} />
          <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
            {showSidebar && (
              <aside className="v2-sidebar course-sidebar">
                <div className="v2-sidebar-header v2-sidebar-header-course">
                  <div className="v2-sidebar-course-hero">
                    <div>
                      <div className="v2-module-nav-kicker">Learning workspace</div>
                      <h3 className="v2-sidebar-title">{course.repoName}</h3>
                      <p className="v2-sidebar-summary">Track your progress, review key concepts, and jump to any module without losing context.</p>
                    </div>
                    <div className="v2-sidebar-progress-card v2-sidebar-progress-card-compact">
                      <div className="v2-sidebar-progress-head">
                        <span>Progress</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="v2-sidebar-progress-bar">
                        <div style={{ height: "100%", width: `${progress}%`, background: progress >= 100 ? "var(--teal)" : "var(--accent)", borderRadius: 999, transition: "width 0.4s ease" }} />
                      </div>
                      <div className="v2-sidebar-progress-caption">{completedModules.length} of {totalModules} modules completed</div>
                    </div>
                  </div>

                  <div className="v2-sidebar-toolbar">
                    <button
                      onClick={() => setShowFlashcards(true)}
                      title="Review flashcards"
                      className={`v2-sidebar-tool-btn ${flashcardDueCount > 0 ? "has-notice" : ""}`}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                      </svg>
                      Review
                      {flashcardDueCount > 0 && (
                        <span className="flashcard-tab-badge">{flashcardDueCount}</span>
                      )}
                    </button>
                    <div className="v2-sidebar-progress">
                      <ProgressRing percent={progress} size={32} stroke={3} />
                      <span className="v2-sidebar-progress-text">{progress}%</span>
                    </div>
                  </div>
                </div>

                <V2ModuleSidebar
                  modules={v2Data.modules}
                  activeIndex={activeModuleIndex}
                  completedModules={completedModules}
                  quizScores={quizScores}
                  showOverview={!!v2Data.overviewGraph}
                  onSelect={handleModuleSelect}
                />

                <div className="v2-sidebar-info">
                  <div className="v2-sidebar-section v2-sidebar-section-card">
                    <span className="v2-sidebar-label">Quick actions</span>
                    <div className="v2-share-row">
                      <button onClick={handleCopyShare} className="v2-share-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Copy Share Link
                      </button>
                      <a
                        href={course.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="v2-share-btn"
                        style={{ textDecoration: "none" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M15 3h6v6" />
                          <path d="M10 14 21 3" />
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        </svg>
                        Open GitHub
                      </a>
                    </div>
                  </div>
                  {v2Data.languages.length > 0 && (
                    <div className="v2-sidebar-section">
                      <span className="v2-sidebar-label">Languages</span>
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                        {v2Data.languages.map((l) => (
                          <span key={l} className="badge" style={{ background: "var(--teal-light)", color: "var(--teal)" }}>{l}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {v2Data.frameworks.length > 0 && (
                    <div className="v2-sidebar-section">
                      <span className="v2-sidebar-label">Frameworks</span>
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                        {v2Data.frameworks.map((f) => (
                          <span key={f} className="badge" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {v2Data.estimatedTotalMinutes > 0 && (
                    <div className="v2-sidebar-section">
                      <span className="v2-sidebar-label">Duration</span>
                      <span style={{ fontSize: "0.8rem" }}>~{v2Data.estimatedTotalMinutes} min</span>
                    </div>
                  )}
                  {user && course.createdBy === user.id && (
                    <div className="v2-sidebar-section v2-sidebar-section-card">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: "0.8rem", fontWeight: 500 }}>Auto-update</div>
                          <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>Regenerate on push</div>
                        </div>
                        <button
                          onClick={handleToggleWebhook}
                          disabled={webhookToggling}
                          style={{
                            width: 44, height: 24, borderRadius: 12, border: "none",
                            cursor: webhookToggling ? "wait" : "pointer",
                            background: webhookInfo?.autoRegenerate ? "var(--teal)" : "var(--border-color)",
                            position: "relative", transition: "background 0.2s ease",
                          }}
                        >
                          <div style={{
                            width: 18, height: 18, borderRadius: "50%", background: "white",
                            position: "absolute", top: 3,
                            left: webhookInfo?.autoRegenerate ? 23 : 3,
                            transition: "left 0.2s ease",
                            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            )}

            {mobileMenuOpen && (
              <>
                <div className="v2-mobile-overlay" onClick={() => setMobileMenuOpen(false)} />
                <aside className="v2-mobile-sidebar">
                  <div className="v2-sidebar-header">
                    <h3 className="v2-sidebar-title">Modules</h3>
                    <div className="v2-sidebar-progress">
                      <ProgressRing percent={progress} size={32} stroke={3} />
                      <span className="v2-sidebar-progress-text">{progress}%</span>
                    </div>
                  </div>
                  <V2ModuleSidebar
                    modules={v2Data.modules}
                    activeIndex={activeModuleIndex}
                    completedModules={completedModules}
                    quizScores={quizScores}
                    showOverview={!!v2Data.overviewGraph}
                    onSelect={handleModuleSelect}
                  />
                </aside>
              </>
            )}

            <div ref={mainScrollRef} className="v2-main-scroll">
              <ErrorBoundary>
              {activeModuleIndex === null && v2Data.overviewGraph && (
                <div className="v2-overview-section">
                  <div className="v2-overview-tabs" role="tablist" aria-label="Overview visualization tabs">
                    <button
                      id="tab-graph"
                      className={`v2-overview-tab ${overviewTab === "graph" ? "v2-overview-tab-active" : ""}`}
                      onClick={() => setOverviewTab("graph")}
                      role="tab"
                      aria-selected={overviewTab === "graph"}
                      aria-controls="tabpanel-graph"
                      tabIndex={overviewTab === "graph" ? 0 : -1}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight") {
                          setOverviewTab("diagram");
                          (document.getElementById("tab-diagram") as HTMLElement)?.focus();
                        }
                      }}
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
                      id="tab-diagram"
                      className={`v2-overview-tab ${overviewTab === "diagram" ? "v2-overview-tab-active" : ""}`}
                      onClick={() => setOverviewTab("diagram")}
                      role="tab"
                      aria-selected={overviewTab === "diagram"}
                      aria-controls="tabpanel-diagram"
                      tabIndex={overviewTab === "diagram" ? 0 : -1}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft") {
                          setOverviewTab("graph");
                          (document.getElementById("tab-graph") as HTMLElement)?.focus();
                        }
                      }}
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
                    <div id="tabpanel-graph" role="tabpanel" aria-labelledby="tab-graph">
                      <KnowledgeGraph
                        overviewGraph={v2Data.overviewGraph}
                        onModuleClick={handleModuleSelect}
                      />
                    </div>
                  ) : (
                    <div id="tabpanel-diagram" role="tabpanel" aria-labelledby="tab-diagram">
                      <AbstractionMap
                        graph={v2Data.overviewGraph}
                        onModuleClick={handleModuleSelect}
                        modules={v2Data.modules}
                      />
                    </div>
                  )}
                </div>
              )}
              {activeModuleIndex !== null && v2Data.modules[activeModuleIndex] && (
                <V2ModuleContent
                  module={v2Data.modules[activeModuleIndex]}
                  moduleIndex={activeModuleIndex}
                  totalModules={v2Data.totalModules}
                  githubUrl={v2Data.githubUrl}
                  courseId={courseId}
                  isCompleted={completedModules.includes(activeModuleIndex)}
                  quizScore={quizScores.get(activeModuleIndex)}
                  onComplete={() => markModuleComplete(activeModuleIndex)}
                  onPrev={() => handleModuleSelect(activeModuleIndex === 0 ? (v2Data.overviewGraph ? null : 0) : activeModuleIndex - 1)}
                  onNext={() => handleModuleSelect(Math.min(v2Data.totalModules - 1, activeModuleIndex + 1))}
                  onPractice={() => setPracticeModuleIndex(activeModuleIndex)}
                  hasOverview={!!v2Data.overviewGraph}
                />
              )}
              </ErrorBoundary>
            </div>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <iframe
            ref={iframeRef}
            src={iframeSrc!}
            sandbox="allow-scripts allow-same-origin"
            style={{ flex: 1, border: "none", background: "white" }}
            title={`${course.ownerName}/${course.repoName} Course`}
          />

          {showSidebar && (
            <aside className="course-sidebar" style={{
              width: 280, background: "var(--bg-primary)",
              borderLeft: "1px solid var(--border-color)",
              padding: "1.25rem", overflowY: "auto", flexShrink: 0,
            }}>
              <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                Course Info
              </h3>
              {course.oneLiner && (
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "1rem" }}>
                  {course.oneLiner}
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.25rem" }}>
                {course.difficulty && (
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginBottom: "0.125rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Difficulty</div>
                    <div style={{ fontSize: "0.85rem" }}>{course.difficulty}</div>
                  </div>
                )}
                {course.estimatedMinutes && (
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginBottom: "0.125rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Duration</div>
                    <div style={{ fontSize: "0.85rem" }}>~{course.estimatedMinutes} minutes</div>
                  </div>
                )}
                {course.moduleCount && (
                  <div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginBottom: "0.125rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Progress</div>
                    <div style={{ fontSize: "0.85rem" }}>{completedModules.length} / {course.moduleCount} modules</div>
                  </div>
                )}
              </div>
              {course.techStack && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)", marginBottom: "0.375rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tech Stack</div>
                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                    {[...(course.techStack.languages || []), ...(course.techStack.frameworks || [])].map((t) => (
                      <span key={t} className="badge" style={{ background: "var(--teal-light)", color: "var(--teal)" }}>{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {user && course.createdBy === user.id && (
                <div style={{ marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0.625rem", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                  <div>
                    <div style={{ fontSize: "0.8rem", fontWeight: 500 }}>Auto-update</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>Regenerate on push</div>
                  </div>
                  <button
                    onClick={handleToggleWebhook}
                    disabled={webhookToggling}
                    style={{
                      width: 44, height: 24, borderRadius: 12, border: "none",
                      cursor: webhookToggling ? "wait" : "pointer",
                      background: webhookInfo?.autoRegenerate ? "var(--teal)" : "var(--border-color)",
                      position: "relative", transition: "background 0.2s ease",
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: "50%", background: "white",
                      position: "absolute", top: 3,
                      left: webhookInfo?.autoRegenerate ? 23 : 3,
                      transition: "left 0.2s ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }} />
                  </button>
                </div>
              )}
              <a
                href={course.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ width: "100%", justifyContent: "center", textDecoration: "none", fontSize: "0.85rem" }}
              >
                View on GitHub ↗
              </a>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
