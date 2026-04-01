"use client";

import { useState, useEffect } from "react";
import { FOCUS_AREAS } from "@/lib/course-types";

interface WizardConfig {
  goal: string;
  focusAreas: string[];
  depth: "quick" | "full" | "deep";
}

interface CourseWizardProps {
  courseId: string;
  repoName: string;
  ownerName: string;
  onComplete: (config: WizardConfig) => void;
  onSkip: () => void;
}

const DEPTH_OPTIONS = [
  { key: "quick" as const, label: "Quick Review", desc: "Cover the big picture, skip deep internals", icon: "⚡" },
  { key: "full" as const, label: "Full Walkthrough", desc: "Thorough coverage of key concepts", icon: "📖" },
  { key: "deep" as const, label: "Deep Dive", desc: "Master every detail and edge case", icon: "🔬" },
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="wizard-steps">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`wizard-step-dot ${i < current ? "wizard-step-done" : i === current ? "wizard-step-active" : ""}`}
        />
      ))}
    </div>
  );
}

export function CourseWizard({ courseId, repoName, ownerName, onComplete, onSkip }: CourseWizardProps) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [depth, setDepth] = useState<"quick" | "full" | "deep">("full");

  const totalSteps = 3;

  const toggleArea = (key: string) => {
    setSelectedAreas((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]
    );
  };

  const handleFinish = () => {
    const config: WizardConfig = { goal, focusAreas: selectedAreas, depth };
    try {
      localStorage.setItem(`wizard-${courseId}`, JSON.stringify(config));
    } catch {}
    fetch(`/api/courses/${courseId}/progress`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ wizardConfig: config }),
    }).catch(() => {});
    onComplete(config);
  };

  const handleSkip = () => {
    try {
      localStorage.setItem(`wizard-${courseId}`, "skipped");
    } catch {}
    onSkip();
  };

  return (
    <div className="modal-overlay wizard-overlay" role="dialog" aria-modal="true" aria-label="Set your learning preferences">
      <div className="modal-content wizard-modal">
        <div className="wizard-header">
          <div className="wizard-repo-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
            {ownerName}/{repoName}
          </div>
          <StepIndicator current={step} total={totalSteps} />
          <button className="wizard-skip-btn" onClick={handleSkip} title="Skip setup">
            Skip
          </button>
        </div>

        <div className="wizard-body">
          {step === 0 && (
            <div className="wizard-step">
              <div className="wizard-step-icon">🎯</div>
              <h2 className="wizard-step-title">What do you want to accomplish?</h2>
              <p className="wizard-step-desc">
                This helps you stay focused as you work through the course.
              </p>
              <textarea
                className="wizard-textarea"
                placeholder={`e.g. "I need to add a new API endpoint and understand how auth works" or "I'm reviewing this codebase for a security audit"`}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={4}
                autoFocus
              />
            </div>
          )}

          {step === 1 && (
            <div className="wizard-step">
              <div className="wizard-step-icon">🔍</div>
              <h2 className="wizard-step-title">Which areas matter most to you?</h2>
              <p className="wizard-step-desc">
                Select any that are relevant — modules covering these topics will be highlighted.
              </p>
              <div className="wizard-focus-grid">
                {FOCUS_AREAS.map((area) => (
                  <button
                    key={area.key}
                    className={`wizard-focus-chip ${selectedAreas.includes(area.key) ? "wizard-focus-chip-active" : ""}`}
                    onClick={() => toggleArea(area.key)}
                  >
                    <span className="wizard-chip-emoji">{area.emoji}</span>
                    {area.label}
                    {selectedAreas.includes(area.key) && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto" }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-step">
              <div className="wizard-step-icon">📚</div>
              <h2 className="wizard-step-title">How do you like to learn?</h2>
              <p className="wizard-step-desc">
                This sets the pace for your study sessions — you can always change this later.
              </p>
              <div className="wizard-depth-options">
                {DEPTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    className={`wizard-depth-option ${depth === opt.key ? "wizard-depth-option-active" : ""}`}
                    onClick={() => setDepth(opt.key)}
                  >
                    <span className="wizard-depth-icon">{opt.icon}</span>
                    <div className="wizard-depth-text">
                      <span className="wizard-depth-label">{opt.label}</span>
                      <span className="wizard-depth-desc">{opt.desc}</span>
                    </div>
                    {depth === opt.key && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" />
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="wizard-footer">
          {step > 0 && (
            <button className="btn-ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <span style={{ flex: 1 }} />
          {step < totalSteps - 1 ? (
            <button className="btn-primary" onClick={() => setStep(step + 1)}>
              Next
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          ) : (
            <button className="btn-primary" onClick={handleFinish}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Start Learning
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
