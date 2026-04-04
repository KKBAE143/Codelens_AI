"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { PERSONAS, DEPTH_PRESETS, FOCUS_AREAS, type WizardConfig } from "@/lib/course-types";
import { ReactorKnob } from "@/components/ui/control-knob";

interface RepoPreview {
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
  repoPreview: RepoPreview | null;
  onClose: () => void;
}

/* ── Inline SVG Icons ─────────────────────────────────────────────── */

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function PersonaIcon({ personaKey, size = 28 }: { personaKey: string; size?: number }) {
  switch (personaKey) {
    case "vibe_coder":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m18 16 4-4-4-4" />
          <path d="m6 8-4 4 4 4" />
          <path d="m14.5 4-5 16" />
        </svg>
      );
    case "new_engineer":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      );
    case "product_manager":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="20" x2="12" y2="10" />
          <line x1="18" y1="20" x2="18" y2="4" />
          <line x1="6" y1="20" x2="6" y2="16" />
        </svg>
      );
    case "security_auditor":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    default:
      return null;
  }
}

/* ── Step Labels ──────────────────────────────────────────────────── */

const STEPS = [
  { key: "repo", label: "Repository" },
  { key: "persona", label: "Role" },
  { key: "customize", label: "Customize" },
  { key: "review", label: "Review" },
] as const;

/* ── Component ────────────────────────────────────────────────────── */

export function CourseWizardModal({
  githubUrl,
  organizationSlug,
  repoPreview,
  onClose,
}: CourseWizardModalProps) {
  const [step, setStep] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [persona, setPersona] = useState("vibe_coder");
  const [depth, setDepth] = useState<"quick" | "full" | "deep">("full");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [customContext, setCustomContext] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const modalRef = useRef<HTMLDivElement>(null);
  const firstFocusableRef = useRef<HTMLElement | null>(null);

  /* ── Keyboard & Focus Trap ─────────────────────────────────────── */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isGenerating) {
        onClose();
      }
      if (e.key === "Enter" && !isGenerating && step < 3) {
        e.preventDefault();
        handleNext();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [step, isGenerating]);

  useEffect(() => {
    // Focus trap: focus first interactive element on mount
    if (modalRef.current && !isGenerating) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length > 0) {
        firstFocusableRef.current = focusable[0];
        focusable[0].focus();
      }
    }
  }, [step, isGenerating]);

  /* ── Navigation ─────────────────────────────────────────────────── */

  const goToStep = useCallback(
    (next: number) => {
      if (next === step || next < 0 || next > 3) return;
      setIsTransitioning(true);
      setTimeout(() => {
        setStep(next);
        setIsTransitioning(false);
      }, 200);
    },
    [step]
  );

  const handleNext = useCallback(() => {
    if (step === 3) {
      handleGenerate();
      return;
    }
    goToStep(step + 1);
  }, [step, goToStep]);

  const handleBack = useCallback(() => {
    if (isGenerating) return;
    goToStep(step - 1);
  }, [step, isGenerating, goToStep]);

  /* ── Toggle Focus Area ──────────────────────────────────────────── */

  const toggleFocus = (key: string) => {
    setFocusAreas((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  };

  /* ── Generate Course ────────────────────────────────────────────── */

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStage("Analyzing repository...");
    setError(null);

    try {
      const config: WizardConfig = {
        persona,
        depth,
        focusAreas,
        customContext,
      };

      const res = await fetch("/api/courses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          githubUrl,
          organizationSlug,
          config,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${res.status}`);
      }

      const data = await res.json();
      const courseId = data.id;

      // Poll for completion
      const poll = async () => {
        for (let i = 0; i < 120; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const statusRes = await fetch(`/api/courses/${courseId}`);
          if (!statusRes.ok) continue;
          const statusData = await statusRes.json();

          if (statusData.status === "completed") {
            setGenerationProgress(100);
            setGenerationStage("Course ready!");
            setTimeout(() => {
              setIsGenerating(false);
              window.location.href = `/course/${courseId}`;
            }, 800);
            return;
          }
          if (statusData.status === "failed") {
            throw new Error(statusData.error || "Generation failed");
          }

          setGenerationStage(statusData.stage || "Processing...");
          setGenerationProgress(Math.min(95, (i / 120) * 100));
        }
        throw new Error("Generation timed out");
      };

      await poll();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
      setIsGenerating(false);
    }
  };

  /* ── Derived Values ─────────────────────────────────────────────── */

  const selectedPersona = PERSONAS.find((p) => p.key === persona) || PERSONAS[0];
  const depthPreset = DEPTH_PRESETS[depth];
  const canProceed = step === 0 ? !!repoPreview : true;

  /* ── Generating State ───────────────────────────────────────────── */

  if (isGenerating) {
    return (
      <ReactorKnob
        progress={generationProgress}
        label="Generating"
        detail={generationStage}
      />
    );
  }

  /* ── Render ─────────────────────────────────────────────────────── */

  return (
    <div className="wizard-modal-overlay" onClick={onClose}>
      <div
        className="wizard-modal-container"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Course generation wizard"
      >
        {/* Close Button */}
        <button
          className="wizard-close-btn"
          onClick={onClose}
          aria-label="Close wizard"
          type="button"
        >
          <CloseIcon />
        </button>

        {/* Step Indicator */}
        <div className="wizard-step-indicator">
          {STEPS.map((s, i) => {
            const isCompleted = i < step;
            const isCurrent = i === step;
            return (
              <div key={s.key} className="wizard-step-item">
                <div
                  className="wizard-step-circle"
                  data-state={isCompleted ? "completed" : isCurrent ? "current" : "upcoming"}
                >
                  {isCompleted ? <CheckCircleIcon /> : <span>{i + 1}</span>}
                </div>
                <span
                  className="wizard-step-label"
                  data-active={isCurrent}
                >
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div
                    className="wizard-step-line"
                    data-filled={i < step}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="wizard-error-banner">
            <AlertIcon />
            <span>{error}</span>
          </div>
        )}

        {/* Step Content */}
        <div
          className={`wizard-content ${
            isTransitioning ? "wizard-content-exit" : "wizard-content-enter"
          }`}
        >
          {/* Step 0: Repository */}
          {step === 0 && (
            <div>
              <h2 className="wizard-step-title">Repository</h2>
              <p className="wizard-step-desc">
                Confirm the repository you want to turn into a course.
              </p>
              {repoPreview ? (
                <div className="wizard-repo-card">
                  <img
                    className="wizard-repo-avatar"
                    src={repoPreview.avatar}
                    alt=""
                  />
                  <div className="wizard-repo-info">
                    <div className="wizard-repo-name">{repoPreview.fullName}</div>
                    {repoPreview.description && (
                      <p className="wizard-repo-desc">{repoPreview.description}</p>
                    )}
                    <div className="wizard-repo-tags">
                      {repoPreview.language && (
                        <span className="wizard-repo-tag">
                          {repoPreview.language}
                        </span>
                      )}
                      <span className="wizard-repo-tag">
                        {repoPreview.stars.toLocaleString()} stars
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="wizard-step-desc" style={{ color: "var(--error)" }}>
                  Could not load repository preview.
                </p>
              )}
            </div>
          )}

          {/* Step 1: Persona */}
          {step === 1 && (
            <div>
              <h2 className="wizard-step-title">Who is this course for?</h2>
              <p className="wizard-step-desc">
                Pick the role that best matches your audience. The AI will tailor the content accordingly.
              </p>
              <div className="wizard-persona-grid">
                {PERSONAS.map((p) => {
                  const isSelected = p.key === persona;
                  return (
                    <button
                      key={p.key}
                      className="wizard-persona-card"
                      data-selected={isSelected}
                      onClick={() => setPersona(p.key)}
                      type="button"
                    >
                      <div className="wizard-persona-emoji">
                        <PersonaIcon personaKey={p.key} />
                      </div>
                      <div className="wizard-persona-name">{p.label}</div>
                      <div className="wizard-persona-tagline">{p.tagline}</div>
                      <ul className="wizard-persona-points">
                        {p.learnPoints.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                      {isSelected && (
                        <div className="wizard-persona-check">
                          <CheckCircleIcon />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Customize */}
          {step === 2 && (
            <div>
              <h2 className="wizard-step-title">Customize your course</h2>
              <p className="wizard-step-desc">
                Choose how deep to go and which areas to focus on.
              </p>

              {/* Course Depth */}
              <div className="wizard-section">
                <label className="wizard-section-label">Course Depth</label>
                <div className="wizard-depth-grid">
                  {(Object.entries(DEPTH_PRESETS) as [string, typeof DEPTH_PRESETS.quick][]).map(
                    ([key, preset]) => {
                      const isSelected = key === depth;
                      return (
                        <button
                          key={key}
                          className="wizard-depth-card"
                          data-selected={isSelected}
                          onClick={() => setDepth(key as "quick" | "full" | "deep")}
                          type="button"
                        >
                          <div className="wizard-depth-name">{preset.label}</div>
                          <div className="wizard-depth-detail">
                            {preset.modules} modules &middot; ~{preset.minutes} min
                          </div>
                          <div className="wizard-depth-detail">{preset.description}</div>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Focus Areas */}
              <div className="wizard-section">
                <label className="wizard-section-label">
                  Focus Areas <span className="wizard-section-optional">(optional)</span>
                </label>
                <div className="wizard-focus-grid">
                  {FOCUS_AREAS.map((area) => {
                    const isSelected = focusAreas.includes(area.key);
                    return (
                      <button
                        key={area.key}
                        className="wizard-focus-pill"
                        data-selected={isSelected}
                        onClick={() => toggleFocus(area.key)}
                        type="button"
                      >
                        {area.emoji} {area.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Context */}
              <div className="wizard-section">
                <label className="wizard-section-label">
                  Custom Context <span className="wizard-section-optional">(optional)</span>
                </label>
                <textarea
                  className="wizard-textarea"
                  placeholder="Add any extra context for the AI — e.g. 'Focus on the authentication flow' or 'Skip the CI/CD section'..."
                  value={customContext}
                  onChange={(e) => setCustomContext(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div>
              <h2 className="wizard-step-title">Review & Generate</h2>
              <p className="wizard-step-desc">
                Double-check your settings before generating the course.
              </p>
              <div className="wizard-summary-card">
                <div className="wizard-summary-row">
                  <span className="wizard-summary-label">Repository</span>
                  <span className="wizard-summary-value wizard-summary-mono">
                    {repoPreview?.fullName || githubUrl}
                  </span>
                </div>
                <div className="wizard-summary-divider" />
                <div className="wizard-summary-row">
                  <span className="wizard-summary-label">Persona</span>
                  <span className="wizard-summary-value" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <PersonaIcon personaKey={selectedPersona.key} size={18} /> {selectedPersona.label}
                  </span>
                </div>
                <div className="wizard-summary-divider" />
                <div className="wizard-summary-row">
                  <span className="wizard-summary-label">Depth</span>
                  <span className="wizard-summary-value">{depthPreset.label}</span>
                </div>
                <div className="wizard-summary-divider" />
                <div className="wizard-summary-row">
                  <span className="wizard-summary-label">Focus Areas</span>
                  <span className="wizard-summary-value">
                    {focusAreas.length > 0 ? (
                      <span className="wizard-summary-tags">
                        {focusAreas.map((key) => {
                          const area = FOCUS_AREAS.find((a) => a.key === key);
                          return (
                            <span key={key} className="wizard-summary-tag">
                              {area?.emoji} {area?.label}
                            </span>
                          );
                        })}
                      </span>
                    ) : (
                      <span className="wizard-summary-muted">None selected</span>
                    )}
                  </span>
                </div>
                <div className="wizard-summary-divider" />
                <div className="wizard-summary-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "0.25rem" }}>
                  <span className="wizard-summary-label">Custom Context</span>
                  <span className="wizard-summary-value wizard-summary-context">
                    {customContext || (
                      <span className="wizard-summary-muted">Not provided</span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="wizard-footer">
          {step > 0 ? (
            <button
              className="wizard-btn-back"
              onClick={handleBack}
              type="button"
              disabled={isGenerating}
            >
              <ChevronLeftIcon /> Back
            </button>
          ) : (
            <div />
          )}
          <button
            className={step === 3 ? "wizard-btn-generate" : "wizard-btn-next"}
            onClick={step === 3 ? handleGenerate : handleNext}
            type="button"
            disabled={!canProceed}
          >
            {step === 3 ? (
              <>
                <LightningIcon /> Generate Course
              </>
            ) : (
              <>
                Continue <ChevronRightIcon />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
