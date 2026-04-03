"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface FlashcardData {
  id: string;
  moduleIndex: number;
  front: string;
  back: string;
  codeSnippet: string | null;
  reviewId: string | null;
  due: string | null;
  reps: number | null;
  schedulingPreview: { again: number; hard: number; good: number; easy: number } | null;
}

interface FlashcardReviewProps {
  courseId: string;
  moduleIndex?: number | null;
  onClose: () => void;
  onLevelUp?: (level: number, levelName: string) => void;
}

const RATINGS = [
  { value: 1, label: "Again", previewKey: "again" as const, color: "var(--error)", bg: "rgba(239,68,68,0.1)", key: "1" },
  { value: 2, label: "Hard", previewKey: "hard" as const, color: "#F59E0B", bg: "rgba(245,158,11,0.1)", key: "2" },
  { value: 3, label: "Good", previewKey: "good" as const, color: "var(--accent)", bg: "var(--accent-light)", key: "3" },
  { value: 4, label: "Easy", previewKey: "easy" as const, color: "var(--teal)", bg: "var(--teal-light)", key: "4" },
];

function formatInterval(days: number): string {
  if (days === 0) return "< 1 min";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}

export function FlashcardReview({ courseId, moduleIndex, onClose, onLevelUp }: FlashcardReviewProps) {
  const queryClient = useQueryClient();
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRating, setIsRating] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionStats, setSessionStats] = useState({ reviewed: 0, correct: 0 });
  const [totalCards, setTotalCards] = useState(0);
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams();
    if (moduleIndex !== undefined && moduleIndex !== null) {
      params.set("moduleIndex", String(moduleIndex));
    }
    const qs = params.toString();
    const url = `/api/courses/${courseId}/flashcards${qs ? `?${qs}` : ""}`;
    fetch(url, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setCards(data.cards || []);
          setTotalCards(data.totalCards || 0);
          setDueCount(data.dueCount || 0);
        }
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [courseId, moduleIndex]);

  const currentCard = cards[currentIndex];

  const handleFlip = useCallback(() => {
    if (!isRating) setIsFlipped(!isFlipped);
  }, [isFlipped, isRating]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === " " && !isRating) {
        e.preventDefault();
        handleFlip();
      }
      if (isFlipped && !isRating) {
        if (e.key === "1") handleRate(1);
        if (e.key === "2") handleRate(2);
        if (e.key === "3") handleRate(3);
        if (e.key === "4") handleRate(4);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFlipped, isRating, handleFlip]);

  async function handleRate(rating: number) {
    if (!currentCard || isRating) return;
    setIsRating(true);

    try {
      await fetch(`/api/courses/${courseId}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ flashcardId: currentCard.id, rating }),
      });

      setSessionStats((prev) => ({
        reviewed: prev.reviewed + 1,
        correct: prev.correct + (rating >= 3 ? 1 : 0),
      }));

      const nextIndex = currentIndex + 1;
      if (nextIndex >= cards.length) {
        setSessionComplete(true);
        fetch(`/api/courses/${courseId}/flashcards`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone },
          credentials: "include",
        })
          .then((r) => r.ok ? r.json() : null)
          .then((data) => {
            if (data?.leveledUp && onLevelUp) {
              onLevelUp(data.newLevel, data.newLevelName);
            }
            queryClient.invalidateQueries({ queryKey: ["user-stats"] });
          })
          .catch(() => {});
      } else {
        setCurrentIndex(nextIndex);
        setIsFlipped(false);
      }
    } catch {}
    setIsRating(false);
  }

  if (isLoading) {
    return (
      <div className="flashcard-overlay">
        <div className="flashcard-modal">
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
            Loading flashcards…
          </div>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="flashcard-overlay" onClick={onClose}>
        <div className="flashcard-modal" onClick={(e) => e.stopPropagation()}>
          <button className="flashcard-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div style={{ textAlign: "center", padding: "3rem 2rem" }}>
            {totalCards === 0 ? (
              <>
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🃏</div>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.3rem", marginBottom: "0.5rem" }}>
                  No flashcards yet
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
                  Flashcards are generated automatically when a course is created.
                  They&apos;ll appear here once this course has been fully generated.
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>✅</div>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.3rem", marginBottom: "0.5rem" }}>
                  All caught up!
                </h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", lineHeight: 1.5 }}>
                  No cards due for review right now. You have {totalCards} card{totalCards !== 1 ? "s" : ""} total.
                  Come back later when more are due.
                </p>
              </>
            )}
            <button className="btn-primary" onClick={onClose} style={{ marginTop: "1.5rem" }}>
              Back to course
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (sessionComplete) {
    const pct = Math.round((sessionStats.correct / sessionStats.reviewed) * 100);
    return (
      <div className="flashcard-overlay">
        <div className="flashcard-modal">
          <button className="flashcard-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div style={{ textAlign: "center", padding: "3rem 2rem" }}>
            <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>
              {pct >= 80 ? "🎉" : pct >= 60 ? "👍" : "💪"}
            </div>
            <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", marginBottom: "0.5rem" }}>
              Session complete!
            </h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              You reviewed {sessionStats.reviewed} card{sessionStats.reviewed !== 1 ? "s" : ""} and recalled{" "}
              <strong style={{ color: pct >= 80 ? "var(--teal)" : pct >= 60 ? "#F59E0B" : "var(--error)" }}>
                {pct}%
              </strong>{" "}
              correctly.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn-primary" onClick={onClose}>
                Back to course
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const progress = Math.round(((currentIndex) / cards.length) * 100);

  return (
    <div className="flashcard-overlay" onClick={onClose}>
      <div className="flashcard-modal" onClick={(e) => e.stopPropagation()}>
        <div className="flashcard-modal-header">
          <button className="flashcard-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="flashcard-progress-bar">
            <div className="flashcard-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="flashcard-counter">
            {currentIndex + 1} / {cards.length}
          </span>
        </div>

        <div
          className={`flashcard-scene ${isFlipped ? "flashcard-scene-flipped" : ""}`}
          onClick={handleFlip}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleFlip(); } }}
          aria-label={isFlipped ? "Card back — click to flip" : "Card front — click to see answer"}
        >
          <div className="flashcard-card">
            <div className="flashcard-face flashcard-front">
              <div className="flashcard-face-label">Question</div>
              <p className="flashcard-text">{currentCard.front}</p>
              <span className="flashcard-hint">Click to reveal answer · Space</span>
            </div>
            <div className="flashcard-face flashcard-back">
              <div className="flashcard-face-label">Answer</div>
              <p className="flashcard-text">{currentCard.back}</p>
              {currentCard.codeSnippet && (
                <pre className="flashcard-code"><code>{currentCard.codeSnippet}</code></pre>
              )}
            </div>
          </div>
        </div>

        {isFlipped && (
          <div className="flashcard-ratings">
            <p className="flashcard-ratings-hint">How well did you recall this?</p>
            <div className="flashcard-rating-buttons">
              {RATINGS.map((r) => {
                const days = currentCard.schedulingPreview?.[r.previewKey];
                const intervalLabel = days !== undefined ? formatInterval(days) : null;
                return (
                  <button
                    key={r.value}
                    className="flashcard-rating-btn"
                    onClick={() => handleRate(r.value)}
                    disabled={isRating}
                    style={{ borderColor: r.color, color: r.color, background: isRating ? "transparent" : r.bg }}
                    title={`${r.label} (${r.key})`}
                  >
                    <span className="flashcard-rating-label">{r.label}</span>
                    {intervalLabel !== null && (
                      <span className="flashcard-rating-desc">{intervalLabel}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function FlashcardDueBanner({ courseId, onClick }: { courseId: string; onClick: () => void }) {
  const [dueCount, setDueCount] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    fetch(`/api/courses/${courseId}/flashcards`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const count = data?.dueCount || 0;
        if (count >= 3) {
          setDueCount(count);
          setVisible(true);
        }
      })
      .catch(() => {});
  }, [courseId]);

  if (!visible) return null;

  return (
    <div className="flashcard-due-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
      <span>
        <strong>{dueCount} flashcard{dueCount !== 1 ? "s" : ""}</strong> due for review
      </span>
      <button className="flashcard-due-banner-btn" onClick={onClick}>
        Review now
      </button>
      <button
        className="flashcard-due-banner-close"
        onClick={() => setVisible(false)}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
