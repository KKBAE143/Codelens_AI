"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";

interface GenerationModalProps {
  courseId: string;
  onClose: () => void;
}

const STAGES = [
  { key: "extracting", label: "Cloning Repository", icon: "📦", avgSeconds: 15 },
  { key: "analyzing", label: "Analyzing Codebase", icon: "🔍", avgSeconds: 30 },
  { key: "designing", label: "Designing Curriculum", icon: "📐", avgSeconds: 45 },
  { key: "generating", label: "Building Course", icon: "⚡", avgSeconds: 90 },
  { key: "polishing", label: "Polishing Output", icon: "✏️", avgSeconds: 30 },
  { key: "completed", label: "Course Ready!", icon: "✨", avgSeconds: 0 },
];

function formatEta(seconds: number): string {
  if (seconds <= 0) return "Almost done...";
  if (seconds < 60) return `~${Math.ceil(seconds / 5) * 5}s remaining`;
  const mins = Math.ceil(seconds / 60);
  return `~${mins} min remaining`;
}

export function GenerationModal({ courseId, onClose }: GenerationModalProps) {
  const [status, setStatus] = useState<string>("pending");
  const [progress, setProgress] = useState({ stage: "pending", detail: "Waiting to start...", percent: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [startTime] = useState(() => Date.now());
  const [stageStartTime, setStageStartTime] = useState(() => Date.now());
  const [lastStage, setLastStage] = useState("pending");
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/courses/${courseId}/status`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setStatus(data.status);
      if (data.progress) {
        setProgress(data.progress);
        if (data.progress.stage !== lastStage) {
          setLastStage(data.progress.stage);
          setStageStartTime(Date.now());
        }
      }
      if (data.errorMessage) setErrorMessage(data.errorMessage);

      if (data.status === "completed") {
        if (intervalRef.current) clearInterval(intervalRef.current);
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        setTimeout(() => router.push(`/course/${courseId}`), 1500);
      } else if (data.status === "failed") {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch {}
  }, [courseId, router, lastStage]);

  useEffect(() => {
    pollStatus();
    intervalRef.current = setInterval(pollStatus, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [pollStatus]);

  const currentStageIndex = STAGES.findIndex((s) => s.key === progress.stage);

  const estimatedRemainingSeconds = (() => {
    if (status === "completed" || status === "failed") return 0;
    const idx = currentStageIndex >= 0 ? currentStageIndex : 0;
    const currentStageDef = STAGES[idx];
    const elapsedInStage = (Date.now() - stageStartTime) / 1000;
    const remainingInCurrent = Math.max(0, (currentStageDef?.avgSeconds || 30) - elapsedInStage);
    let futureTotal = 0;
    for (let i = idx + 1; i < STAGES.length - 1; i++) {
      futureTotal += STAGES[i].avgSeconds;
    }
    return remainingInCurrent + futureTotal;
  })();

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && status === "failed" && onClose()}>
      <div className="modal-content" style={{ maxWidth: 540 }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            {status === "completed" ? "Your course is ready!" : status === "failed" ? "Generation failed" : "Generating your course..."}
          </h2>
          {status !== "completed" && status !== "failed" && (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
              {formatEta(estimatedRemainingSeconds)}
            </p>
          )}
        </div>

        <div style={{
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-md)",
          height: 6,
          marginBottom: "1.5rem",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${progress.percent}%`,
            background: status === "failed" ? "var(--error)" : "var(--accent)",
            borderRadius: "var(--radius-md)",
            transition: "width 0.5s ease",
          }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
          {STAGES.map((stage, i) => {
            const isActive = stage.key === progress.stage;
            const isDone = currentStageIndex > i || status === "completed";
            const isFuture = currentStageIndex < i && status !== "completed";
            return (
              <div key={stage.key} style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                opacity: isFuture ? 0.35 : 1,
                transition: "opacity 0.3s",
              }}>
                <span className={isActive ? "stage-active-pulse" : ""} style={{ fontSize: "1.25rem", lineHeight: 1 }}>
                  {isDone ? "✅" : stage.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: "0.9rem",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                  }}>
                    {stage.label}
                  </div>
                  {isActive && progress.detail && (
                    <div style={{
                      fontSize: "0.8rem",
                      color: "var(--text-tertiary)",
                      marginTop: "0.25rem",
                      lineHeight: 1.4,
                    }}>
                      {progress.detail}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {status === "failed" && (
          <div style={{
            background: "#FFF0EE",
            border: "1px solid #F5C6C0",
            borderRadius: "var(--radius-sm)",
            padding: "1rem",
            marginBottom: "1rem",
          }}>
            <p style={{ fontSize: "0.85rem", color: "var(--error)", marginBottom: "0.75rem" }}>
              {errorMessage || "An unexpected error occurred during generation."}
            </p>
            <button className="btn-primary" onClick={onClose} style={{ width: "100%" }}>
              Try Again
            </button>
          </div>
        )}

        {status === "completed" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "var(--teal)", fontWeight: 600, fontSize: "0.95rem" }}>
              Redirecting to your course...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
