"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ReactorKnob } from "./ui/control-knob";
import {
  PERSONAS,
  DEPTH_PRESETS,
  FOCUS_AREAS,
  type WizardConfig,
} from "@/lib/course-types";

interface RepoMeta {
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  language: string | null;
  languages?: Record<string, number>;
  updatedAt: string;
  owner: { avatar: string; login: string };
}

interface RepoPreviewData {
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  language: string | null;
  avatar: string;
}

interface CourseWizardModalProps {
  githubUrl: string;
  organizationSlug?: string;
  repoPreview?: RepoPreviewData | null;
  onClose: () => void;
}

const STORAGE_KEY = "codelens_wizard_prefs";

function loadPrefs(): Partial<WizardConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePrefs(config: WizardConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

const GENERATION_STAGES = [
  {
    key: "extracting",
    label: "Cloning Repository",
    icon: "clone",
    avgSeconds: 15,
  },
  {
    key: "analyzing",
    label: "Analyzing Codebase",
    icon: "analyze",
    avgSeconds: 30,
  },
  {
    key: "designing",
    label: "Designing Curriculum",
    icon: "design",
    avgSeconds: 45,
  },
  {
    key: "generating",
    label: "Building Course",
    icon: "build",
    avgSeconds: 90,
  },
  {
    key: "polishing",
    label: "Polishing Output",
    icon: "polish",
    avgSeconds: 30,
  },
  { key: "completed", label: "Course Ready!", icon: "done", avgSeconds: 0 },
];

export function CourseWizardModal({
  githubUrl,
  organizationSlug,
  repoPreview: initialPreview,
  onClose,
}: CourseWizardModalProps) {
  const router = useRouter();
  const savedPrefs = loadPrefs();

  const [step, setStep] = useState(1);
  const [repoMeta, setRepoMeta] = useState<RepoMeta | null>(null);
  const [repoLoading, setRepoLoading] = useState(true);
  const [repoError, setRepoError] = useState<string | null>(null);

  const [persona, setPersona] = useState<string>(savedPrefs.persona || "");
  const [depth, setDepth] = useState<"quick" | "full" | "deep">(
    savedPrefs.depth || "full",
  );
  const [focusAreas, setFocusAreas] = useState<string[]>(
    savedPrefs.focusAreas || [],
  );
  const [customContext, setCustomContext] = useState(
    savedPrefs.customContext || "",
  );

  const [generating, setGenerating] = useState(false);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState("pending");
  const [genProgress, setGenProgress] = useState<{
    stage: string;
    detail: string;
    percent: number;
    queuePosition?: number;
    estimatedWait?: number;
  }>({ stage: "pending", detail: "Waiting to start...", percent: 0 });
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPreview) {
      setRepoMeta({
        name: initialPreview.name,
        fullName: initialPreview.fullName,
        description: initialPreview.description,
        stars: initialPreview.stars,
        language: initialPreview.language,
        updatedAt: new Date().toISOString(),
        owner: {
          avatar: initialPreview.avatar,
          login: initialPreview.fullName.split("/")[0],
        },
      });
      setRepoLoading(false);
      return;
    }

    const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) {
      setRepoError("Invalid GitHub URL");
      setRepoLoading(false);
      return;
    }
    const [, owner, repo] = match;

    const controller = new AbortController();
    fetch(
      `/api/github/repo?repo=${encodeURIComponent(`${owner}/${repo.replace(/\.git$/, "")}`)}`,
      {
        signal: controller.signal,
        credentials: "include",
      },
    )
      .then((r) => {
        if (!r.ok) throw new Error("Repository not found");
        return r.json();
      })
      .then((data) => {
        setRepoMeta({
          name: data.name,
          fullName: data.full_name,
          description: data.description,
          stars: data.stargazers_count,
          language: data.language,
          updatedAt: data.pushed_at,
          owner: { avatar: data.owner.avatar_url, login: data.owner.login },
        });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setRepoError(e.message);
      })
      .finally(() => setRepoLoading(false));

    return () => controller.abort();
  }, [githubUrl, initialPreview]);

  const canProceed = useCallback(() => {
    if (step === 1) return !!repoMeta;
    if (step === 2) return !!persona;
    if (step === 3) return true;
    return true;
  }, [step, repoMeta, persona]);

  const handleGenerate = useCallback(async () => {
    const config: WizardConfig = { persona, depth, focusAreas, customContext };
    savePrefs(config);
    setGenerating(true);
    setGenError(null);

    try {
      const res = await fetch("/api/courses/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          githubUrl,
          targetAudience: persona,
          depth,
          focusAreas,
          customContext,
          ...(organizationSlug ? { organizationSlug } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start generation");
      setCourseId(data.courseId);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Something went wrong");
      setGenerating(false);
    }
  }, [githubUrl, persona, depth, focusAreas, customContext, organizationSlug]);

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    let eventSource: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const handleStatusUpdate = (data: {
      status: string;
      progress?: {
        stage: string;
        detail: string;
        percent: number;
        queuePosition?: number;
        estimatedWait?: number;
      };
      errorMessage?: string;
    }) => {
      if (!active) return;
      setGenStatus(data.status);
      if (data.progress) setGenProgress(data.progress);
      if (data.errorMessage) setGenError(data.errorMessage);

      if (data.status === "completed") {
        import("canvas-confetti")
          .then((mod) =>
            mod.default({ particleCount: 100, spread: 70, origin: { y: 0.6 } }),
          )
          .catch(() => {});
        setTimeout(() => router.push(`/course/${courseId}`), 1500);
      }
    };

    const trySSE = () => {
      try {
        eventSource = new EventSource(`/api/courses/${courseId}/status/stream`);
        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleStatusUpdate(data);
            if (data.status === "completed" || data.status === "failed") {
              eventSource?.close();
            }
          } catch {}
        };
        eventSource.onerror = () => {
          eventSource?.close();
          eventSource = null;
          if (active) fallbackToPoll();
        };
      } catch {
        fallbackToPoll();
      }
    };

    const fallbackToPoll = () => {
      const poll = async () => {
        try {
          const res = await fetch(`/api/courses/${courseId}/status`, {
            credentials: "include",
          });
          if (!res.ok || !active) return;
          const data = await res.json();
          handleStatusUpdate(data);
          if (data.status === "completed" || data.status === "failed") return;
        } catch {}
        if (active) pollTimer = setTimeout(poll, 2000);
      };
      poll();
    };

    trySSE();

    return () => {
      active = false;
      eventSource?.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [courseId, router]);

  const toggleFocusArea = (key: string) => {
    setFocusAreas((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const currentStageIndex = GENERATION_STAGES.findIndex(
    (s) => s.key === genProgress.stage,
  );

  if (generating) {
    const defaultLabel = genProgress.stage || "generating";
    const label = genStatus === "failed" ? "FAILED" : genStatus === "completed" ? "COMPLETE" : defaultLabel;
    const defaultDetail = genProgress.detail || "Waiting to start...";
    const detail = genStatus === "failed" 
        ? (genError || "An unexpected error occurred.") 
        : genStatus === "completed" 
            ? "Redirecting to your course..." 
            : defaultDetail;

    return (
      <>
        <ReactorKnob
          progress={genProgress.percent}
          label={label.toUpperCase().replace("-", " ")}
          detail={detail}
        />
        {genStatus === "failed" && (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
          >
            <div className="bg-neutral-900 border border-red-500/30 p-8 rounded-xl text-center max-w-sm">
              <div className="text-red-500 mb-4 text-5xl">⚠</div>
              <h3 className="text-white font-bold mb-2 text-xl font-heading">Generation Failed</h3>
              <p className="text-neutral-400 text-sm mb-6">{genError || "An unexpected error occurred during generation."}</p>
              <button
                className="bg-white text-black px-6 py-2.5 rounded-lg font-bold w-full transition-transform hover:scale-105 active:scale-95"
                onClick={onClose}
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-content wizard-modal"
        style={{ maxWidth: 620 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="wizard-steps-indicator"
          style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}
        >
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: s <= step ? "var(--accent)" : "var(--bg-tertiary)",
                transition: "background 0.3s",
              }}
            />
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            background: "none",
            border: "none",
            fontSize: "1.2rem",
            color: "var(--text-tertiary)",
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          &times;
        </button>

        {step === 1 && (
          <div>
            <h2 className="wizard-title">Confirm Repository</h2>
            <p className="wizard-subtitle">
              Make sure this is the right repo before we begin.
            </p>

            {repoLoading && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                <div
                  className="skeleton"
                  style={{ height: 20, width: "60%" }}
                />
                <div
                  className="skeleton"
                  style={{ height: 16, width: "80%" }}
                />
                <div
                  className="skeleton"
                  style={{ height: 16, width: "40%" }}
                />
              </div>
            )}

            {repoError && (
              <p style={{ color: "var(--error)", fontSize: "0.85rem" }}>
                {repoError}
              </p>
            )}

            {repoMeta && (
              <div className="lux-repo-card">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <img
                    src={repoMeta.owner.avatar}
                    alt=""
                    style={{ width: 40, height: 40, borderRadius: "50%" }}
                  />
                  <div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "0.95rem",
                        fontWeight: 600,
                      }}
                    >
                      {repoMeta.fullName}
                    </div>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        color: "var(--text-tertiary)",
                      }}
                    >
                      Updated{" "}
                      {new Date(repoMeta.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {repoMeta.description && (
                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.5,
                      marginBottom: "0.75rem",
                    }}
                  >
                    {repoMeta.description}
                  </p>
                )}
                <div
                  style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                >
                  {repoMeta.language && (
                    <span
                      className="badge"
                      style={{
                        background: "var(--teal-light)",
                        color: "var(--teal)",
                      }}
                    >
                      {repoMeta.language}
                    </span>
                  )}
                  <span
                    className="badge"
                    style={{
                      background: "var(--bg-secondary)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {repoMeta.stars.toLocaleString()} stars
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="wizard-title">Who are you?</h2>
            <p className="wizard-subtitle">
              Choose your role so we tailor the course to you.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
              }}
            >
              {PERSONAS.map((p) => {
                const isSelected = persona === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => setPersona(p.key)}
                    className={`lux-selector ${isSelected ? "selected" : ""}`}
                  >
                    <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>
                      {p.emoji}
                    </div>
                    <div
                      style={{
                        fontSize: "0.9rem",
                        fontWeight: 600,
                        marginBottom: "0.25rem",
                      }}
                    >
                      {p.label}
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        lineHeight: 1.4,
                        marginBottom: "0.5rem",
                      }}
                    >
                      {p.tagline}
                    </div>
                    <ul
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text-tertiary)",
                        listStyle: "none",
                        padding: 0,
                      }}
                    >
                      {p.learnPoints.map((lp, i) => (
                        <li key={i} style={{ marginBottom: "0.2rem" }}>
                          {"\u2192"} {lp}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="wizard-title">Customize Your Course</h2>
            <p className="wizard-subtitle">
              Set the depth and focus areas for your learning experience.
            </p>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: "0.5rem",
                  display: "block",
                }}
              >
                Course Depth
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "0.75rem",
                }}
              >
                {(
                  Object.entries(DEPTH_PRESETS) as [
                    keyof typeof DEPTH_PRESETS,
                    (typeof DEPTH_PRESETS)[keyof typeof DEPTH_PRESETS],
                  ][]
                ).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => setDepth(key as "quick" | "full" | "deep")}
                    className={`lux-selector ${depth === key ? "selected" : ""}`}
                    style={{ textAlign: "center", padding: "1rem" }}
                  >
                    <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                      {preset.label}
                    </div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--text-tertiary)",
                        marginTop: "0.25rem",
                      }}
                    >
                      ~{preset.modules} modules, {preset.minutes} min
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <label
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: "0.5rem",
                  display: "block",
                }}
              >
                Focus Areas{" "}
                <span
                  style={{ fontWeight: 400, color: "var(--text-tertiary)" }}
                >
                  (optional)
                </span>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
                {FOCUS_AREAS.map((fa) => {
                  const isSelected = focusAreas.includes(fa.key);
                  return (
                    <button
                      key={fa.key}
                      onClick={() => toggleFocusArea(fa.key)}
                      className={`lux-badge ${isSelected ? "selected" : ""}`}
                    >
                      {fa.emoji} {fa.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  marginBottom: "0.5rem",
                  display: "block",
                }}
              >
                Anything specific?{" "}
                <span
                  style={{ fontWeight: 400, color: "var(--text-tertiary)" }}
                >
                  (optional)
                </span>
              </label>
              <textarea
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder="e.g., I want to understand how the auth system works with the database..."
                style={{
                  width: "100%",
                  minHeight: 70,
                  padding: "0.75rem",
                  border: "1.5px solid var(--border-color)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.85rem",
                  fontFamily: "var(--font-body)",
                  resize: "vertical",
                  outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
                onBlur={(e) =>
                  (e.target.style.borderColor = "var(--border-color)")
                }
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <h2 className="wizard-title">Ready to Generate</h2>
            <p className="wizard-subtitle">
              Review your selections and start building your course.
            </p>

            <div
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ color: "var(--text-tertiary)" }}>
                  Repository
                </span>
                <span
                  style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}
                >
                  {repoMeta?.fullName ||
                    githubUrl.replace("https://github.com/", "")}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ color: "var(--text-tertiary)" }}>Persona</span>
                <span style={{ fontWeight: 600 }}>
                  {PERSONAS.find((p) => p.key === persona)?.label}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ color: "var(--text-tertiary)" }}>Depth</span>
                <span style={{ fontWeight: 600 }}>
                  {DEPTH_PRESETS[depth].label} (~{DEPTH_PRESETS[depth].modules}{" "}
                  modules)
                </span>
              </div>
              {focusAreas.length > 0 && (
                <div>
                  <span
                    style={{
                      color: "var(--text-tertiary)",
                      fontSize: "0.85rem",
                    }}
                  >
                    Focus areas
                  </span>
                  <div
                    style={{
                      display: "flex",
                      gap: "0.375rem",
                      flexWrap: "wrap",
                      marginTop: "0.375rem",
                    }}
                  >
                    {focusAreas.map((key) => {
                      const fa = FOCUS_AREAS.find((f) => f.key === key);
                      return fa ? (
                        <span
                          key={key}
                          className="badge"
                          style={{
                            background: "var(--accent-light)",
                            color: "var(--accent)",
                          }}
                        >
                          {fa.emoji} {fa.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
              {customContext && (
                <div style={{ fontSize: "0.8rem" }}>
                  <span style={{ color: "var(--text-tertiary)" }}>
                    Custom context
                  </span>
                  <p
                    style={{
                      color: "var(--text-secondary)",
                      marginTop: "0.25rem",
                      fontStyle: "italic",
                    }}
                  >
                    {customContext}
                  </p>
                </div>
              )}
            </div>

            {genError && (
              <p
                style={{
                  color: "var(--error)",
                  fontSize: "0.85rem",
                  marginBottom: "0.75rem",
                }}
              >
                {genError}
              </p>
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: "1.5rem",
            gap: "0.75rem",
          }}
        >
          {step > 1 ? (
            <button
              className="btn-secondary"
              onClick={() => setStep(step - 1)}
              style={{ fontSize: "0.85rem" }}
            >
              Back
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              className="btn-primary"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              style={{ fontSize: "0.85rem", padding: "0.625rem 1.5rem" }}
            >
              Continue
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleGenerate}
              style={{ fontSize: "0.85rem", padding: "0.625rem 1.5rem" }}
            >
              Generate Course
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
