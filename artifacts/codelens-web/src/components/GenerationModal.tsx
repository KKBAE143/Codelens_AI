"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface GenerationModalProps {
  courseId: string;
  onClose: () => void;
}

interface ProgressState {
  stage: string;
  detail: string;
  percent: number;
}

interface StatusPayload {
  status: string;
  progress: ProgressState;
  errorMessage?: string;
}

const STAGES = [
  { key: "extracting", label: "Cloning Repository", description: "Fetching source code from GitHub" },
  { key: "analyzing", label: "Analyzing Codebase", description: "Identifying abstractions & relationships" },
  { key: "designing", label: "Designing Curriculum", description: "Ordering chapters for optimal learning" },
  { key: "generating", label: "Building Course", description: "Writing interactive lessons & quizzes" },
  { key: "polishing", label: "Polishing Output", description: "Assembling & finalizing course" },
  { key: "completed", label: "Course Ready!", description: "Your course is complete" },
];

const SSE_RECONNECT_DELAY = 3000;
const SSE_MAX_RETRIES = 4;
const SAFETY_POLL_INTERVAL = 12000;

function formatEta(seconds: number): string {
  if (seconds <= 0) return "Almost done...";
  if (seconds < 60) return `~${Math.ceil(seconds / 5) * 5}s remaining`;
  const mins = Math.ceil(seconds / 60);
  return `~${mins} min remaining`;
}

function estimateSeconds(stageIndex: number, elapsed: number, progressDetail: string): number {
  const avgPerStage = [15, 35, 30, 90, 15, 0];

  const moduleMatch = progressDetail.match(/module\s+(\d+)\s+of\s+(\d+)/i);
  if (moduleMatch && stageIndex === 3) {
    const current = parseInt(moduleMatch[1], 10);
    const total = parseInt(moduleMatch[2], 10);
    const remaining = total - current;
    const perModuleSec = 25;
    return remaining * perModuleSec + 15;
  }

  const idx = Math.max(0, Math.min(stageIndex, avgPerStage.length - 1));
  const remainInCurrent = Math.max(0, avgPerStage[idx] - elapsed);
  let future = 0;
  for (let i = idx + 1; i < avgPerStage.length - 1; i++) future += avgPerStage[i];
  return remainInCurrent + future;
}

function requestNotificationPermission() {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function sendBrowserNotification(title: string, body: string) {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(title, { body, icon: "/favicon.ico" });
    } catch {}
  }
}

export function GenerationModal({ courseId, onClose }: GenerationModalProps) {
  const [status, setStatus] = useState<string>("pending");
  const [progress, setProgress] = useState<ProgressState>({
    stage: "pending",
    detail: "Initializing pipeline...",
    percent: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stageStartTime, setStageStartTime] = useState(() => Date.now());
  const [elapsedInStage, setElapsedInStage] = useState(0);
  const [sseConnected, setSseConnected] = useState(false);
  const lastStageRef = useRef("pending");
  const terminalHandledRef = useRef(false);
  const sseRetryCountRef = useRef(0);
  const router = useRouter();
  const safetyPollRef = useRef<ReturnType<typeof setInterval>>(null);
  const tickRef = useRef<ReturnType<typeof setInterval>>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const applyPayload = useCallback((data: StatusPayload) => {
    if (terminalHandledRef.current) return;
    setStatus(data.status);

    if (data.progress) {
      setProgress((prev) => {
        if (data.progress.percent < prev.percent && data.progress.stage === prev.stage) {
          return prev;
        }
        return data.progress;
      });
      if (data.progress.stage !== lastStageRef.current) {
        lastStageRef.current = data.progress.stage;
        setStageStartTime(Date.now());
        setElapsedInStage(0);
      }
    }

    if (data.errorMessage) setErrorMessage(data.errorMessage);
  }, []);

  const handleTerminal = useCallback(
    (termStatus: string) => {
      if (terminalHandledRef.current) return;
      terminalHandledRef.current = true;

      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (safetyPollRef.current) {
        clearInterval(safetyPollRef.current);
        safetyPollRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

      if (termStatus === "completed") {
        sendBrowserNotification(
          "Course Ready!",
          "Your course has been generated and is ready to view.",
        );
        import("canvas-confetti")
          .then((mod) =>
            mod.default({
              particleCount: 120,
              spread: 80,
              origin: { y: 0.6 },
            }),
          )
          .catch(() => {});
        setTimeout(() => router.push(`/course/${courseId}`), 1800);
      } else if (termStatus === "failed") {
        sendBrowserNotification(
          "Generation Failed",
          "Course generation encountered an error. Please try again.",
        );
      }
    },
    [courseId, router],
  );

  const connectSSE = useCallback(() => {
    if (terminalHandledRef.current) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource(`/api/courses/${courseId}/status/stream`);
    esRef.current = es;

    es.onopen = () => {
      setSseConnected(true);
      sseRetryCountRef.current = 0;
    };

    es.onmessage = (event) => {
      if (terminalHandledRef.current) return;
      try {
        const data: StatusPayload = JSON.parse(event.data);
        applyPayload(data);
        if (data.status === "completed" || data.status === "failed") {
          handleTerminal(data.status);
        }
      } catch {}
    };

    es.onerror = () => {
      if (terminalHandledRef.current) return;
      es.close();
      esRef.current = null;
      setSseConnected(false);

      if (sseRetryCountRef.current < SSE_MAX_RETRIES) {
        sseRetryCountRef.current++;
        reconnectTimerRef.current = setTimeout(connectSSE, SSE_RECONNECT_DELAY);
      }
    };
  }, [courseId, applyPayload, handleTerminal]);

  useEffect(() => {
    connectSSE();

    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connectSSE]);

  useEffect(() => {
    const safetyPoll = async () => {
      if (terminalHandledRef.current) return;
      try {
        const res = await fetch(`/api/courses/${courseId}/status`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data: StatusPayload = await res.json();
        applyPayload(data);
        if (data.status === "completed" || data.status === "failed") {
          handleTerminal(data.status);
        }
      } catch {}
    };

    safetyPoll();
    safetyPollRef.current = setInterval(safetyPoll, SAFETY_POLL_INTERVAL);

    return () => {
      if (safetyPollRef.current) {
        clearInterval(safetyPollRef.current);
        safetyPollRef.current = null;
      }
    };
  }, [courseId, applyPayload, handleTerminal]);

  useEffect(() => {
    tickRef.current = setInterval(() => {
      setElapsedInStage(Math.floor((Date.now() - stageStartTime) / 1000));
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [stageStartTime]);

  const currentStageIndex = STAGES.findIndex((s) => s.key === progress.stage);
  const effectiveIndex = currentStageIndex >= 0 ? currentStageIndex : 0;
  const isTerminal = status === "completed" || status === "failed";
  const eta = isTerminal ? 0 : estimateSeconds(effectiveIndex, elapsedInStage, progress.detail);
  const smoothPercent = isTerminal
    ? status === "completed"
      ? 100
      : progress.percent
    : Math.max(progress.percent, Math.min(95, (effectiveIndex / STAGES.length) * 100 + 2));

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && status === "failed" && onClose()}
    >
      <div className="modal-content generation-modal">
        <div className="gen-header">
          <div className="gen-icon-ring">
            {status === "completed" ? (
              <span className="gen-icon-done">✓</span>
            ) : status === "failed" ? (
              <span className="gen-icon-fail">✕</span>
            ) : (
              <span className="gen-spinner" />
            )}
          </div>
          <h2 className="gen-title">
            {status === "completed"
              ? "Your course is ready!"
              : status === "failed"
                ? "Generation failed"
                : "Generating your course..."}
          </h2>
          {!isTerminal && (
            <p className="gen-subtitle">{formatEta(eta)}</p>
          )}
        </div>

        <div className="gen-progress-track">
          <div
            className="gen-progress-fill"
            style={{
              width: `${smoothPercent}%`,
              background:
                status === "failed"
                  ? "var(--error, #e53e3e)"
                  : undefined,
            }}
          />
        </div>

        <div className="gen-stages">
          {STAGES.map((stage, i) => {
            const isActive =
              !isTerminal &&
              (stage.key === progress.stage ||
                (progress.stage === "pending" && i === 0));
            const isDone = (currentStageIndex > i && currentStageIndex >= 0) || status === "completed";
            const isFuture = !isDone && !isActive;

            return (
              <div
                key={stage.key}
                className={`gen-stage ${isActive ? "gen-stage--active" : ""} ${isDone ? "gen-stage--done" : ""} ${isFuture ? "gen-stage--future" : ""}`}
              >
                <div className="gen-stage-indicator">
                  {isDone ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="8" fill="var(--accent, #e8563a)" />
                      <path
                        d="M4.5 8.5L6.5 10.5L11.5 5.5"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : isActive ? (
                    <div className="gen-stage-dot gen-stage-dot--active">
                      <div className="gen-stage-dot-inner" />
                    </div>
                  ) : (
                    <div className="gen-stage-dot gen-stage-dot--future">
                      <span>{i + 1}</span>
                    </div>
                  )}
                  {i < STAGES.length - 1 && (
                    <div
                      className={`gen-stage-line ${isDone ? "gen-stage-line--done" : ""}`}
                    />
                  )}
                </div>
                <div className="gen-stage-content">
                  <div className="gen-stage-label">{stage.label}</div>
                  {isActive && (
                    <div className="gen-stage-detail">
                      {progress.detail || stage.description}
                    </div>
                  )}
                  {isDone && !isActive && (
                    <div className="gen-stage-detail gen-stage-detail--done">
                      {stage.description}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {status === "failed" && (
          <div className="gen-error">
            <p className="gen-error-text">
              {errorMessage || "An unexpected error occurred during generation."}
            </p>
            <button className="btn-primary" onClick={onClose} style={{ width: "100%" }}>
              Try Again
            </button>
          </div>
        )}

        {status === "completed" && (
          <div className="gen-success">
            <p>Redirecting to your course...</p>
          </div>
        )}

        {!isTerminal && (
          <div className="gen-connection">
            <span
              className={`gen-connection-dot ${sseConnected ? "gen-connection-dot--live" : ""}`}
            />
            {sseConnected ? "Live updates" : "Checking progress..."}
          </div>
        )}
      </div>
    </div>
  );
}
