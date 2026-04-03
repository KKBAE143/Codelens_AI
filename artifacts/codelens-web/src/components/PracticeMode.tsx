"use client";

import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { V2QuizBlock } from "@/lib/course-types";

interface PracticeModeProps {
  courseId: string;
  moduleIndex: number;
  moduleTitle: string;
  quizBlocks: V2QuizBlock[];
  onClose: () => void;
  onScoreSaved?: (moduleIndex: number, score: number) => void;
  onLevelUp?: (level: number, levelName: string) => void;
}

interface AnsweredQuestion {
  questionIndex: number;
  selectedOption: number;
  isCorrect: boolean;
  block: V2QuizBlock;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function CheckCircle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircle() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

type Mode = "quiz" | "summary" | "wrong-answers";

export function PracticeMode({ courseId, moduleIndex, moduleTitle, quizBlocks, onClose, onScoreSaved, onLevelUp }: PracticeModeProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("quiz");
  const [questionOrder, setQuestionOrder] = useState<number[]>(() => quizBlocks.map((_, i) => i));
  const [isFullRun, setIsFullRun] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answered, setAnswered] = useState<AnsweredQuestion[]>([]);
  const [scoreSaved, setScoreSaved] = useState(false);

  const questions = questionOrder.map((i) => quizBlocks[i]);
  const current = questions[currentQuestion];
  const totalQ = questions.length;
  const correct = answered.filter((a) => a.isCorrect).length;
  const wrongAnswers = answered.filter((a) => !a.isCorrect);
  const score = totalQ > 0 ? Math.round((correct / totalQ) * 100) : 0;

  useEffect(() => {
    if (mode === "summary" && !scoreSaved && totalQ > 0 && isFullRun) {
      setScoreSaved(true);
      fetch(`/api/courses/${courseId}/quiz-scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ moduleIndex, questionsTotal: totalQ, questionsCorrect: correct }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (data?.score !== undefined && onScoreSaved) {
            onScoreSaved(moduleIndex, data.score);
          }
          if (data?.leveledUp && onLevelUp) {
            onLevelUp(data.newLevel, data.newLevelName);
          }
          queryClient.invalidateQueries({ queryKey: ["user-stats"] });
        })
        .catch(() => {});
    }
  }, [mode, scoreSaved, isFullRun, courseId, moduleIndex, totalQ, correct, onScoreSaved, onLevelUp, queryClient]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (mode !== "quiz") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    if (e.key === "Escape") onClose();
    if (revealed && e.key === "Enter") handleNext();
    if (!revealed && e.key >= "1" && e.key <= "4") {
      const idx = parseInt(e.key) - 1;
      if (current?.options[idx]) handleSelect(idx);
    }
  }, [mode, revealed, current, onClose]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleSelect = (optionIndex: number) => {
    if (revealed) return;
    setSelected(optionIndex);
    setRevealed(true);
  };

  const handleNext = () => {
    if (!revealed || current === undefined) return;
    const isCorrect = selected !== null && current.options[selected]?.correct === true;
    setAnswered((prev) => [
      ...prev,
      { questionIndex: questionOrder[currentQuestion], selectedOption: selected ?? -1, isCorrect, block: current },
    ]);

    if (currentQuestion + 1 >= totalQ) {
      setMode("summary");
    } else {
      setCurrentQuestion((prev) => prev + 1);
      setSelected(null);
      setRevealed(false);
    }
  };

  const handleRetry = (wrongOnly = false) => {
    const indices = wrongOnly
      ? wrongAnswers.map((a) => a.questionIndex)
      : quizBlocks.map((_, i) => i);
    setQuestionOrder(shuffle(indices));
    setIsFullRun(!wrongOnly);
    setCurrentQuestion(0);
    setSelected(null);
    setRevealed(false);
    setAnswered([]);
    setScoreSaved(false);
    setMode("quiz");
  };

  if (mode === "summary") {
    const pct = score;
    const emoji = pct >= 80 ? "🎉" : pct >= 60 ? "👍" : "💪";
    const label = isFullRun
      ? (pct >= 80 ? "Excellent!" : pct >= 60 ? "Nice work!" : "Keep practicing!")
      : "Retry complete!";

    return (
      <div className="practice-overlay" onClick={onClose}>
        <div className="practice-modal" onClick={(e) => e.stopPropagation()}>
          <button className="practice-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="practice-summary">
            <div style={{ fontSize: "3.5rem", marginBottom: "0.75rem" }}>{emoji}</div>
            <h2 className="practice-summary-title">{label}</h2>
            <p className="practice-summary-subtitle">
              You got <strong style={{ color: pct >= 80 ? "var(--teal)" : pct >= 60 ? "#F59E0B" : "var(--error)" }}>{correct} of {totalQ}</strong> correct
              {!isFullRun && (
                <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: "0.25rem" }}>
                  (Wrong-answer retry — not saved to mastery score)
                </span>
              )}
            </p>
            <div className="practice-score-ring">
              <svg width="96" height="96" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="48" cy="48" r="40" fill="none" stroke="var(--bg-tertiary)" strokeWidth="8" />
                <circle cx="48" cy="48" r="40" fill="none"
                  stroke={pct >= 80 ? "var(--teal)" : pct >= 60 ? "#F59E0B" : "var(--error)"}
                  strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
              </svg>
              <span className="practice-score-pct" style={{ color: pct >= 80 ? "var(--teal)" : pct >= 60 ? "#F59E0B" : "var(--error)" }}>
                {pct}%
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center", marginTop: "1.5rem" }}>
              <button className="btn-primary" onClick={() => handleRetry(false)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.86" />
                </svg>
                Retry All ({totalQ} questions)
              </button>
              {wrongAnswers.length > 0 && (
                <button className="btn-secondary" onClick={() => setMode("wrong-answers")}>
                  Review Wrong Answers ({wrongAnswers.length})
                </button>
              )}
              <button className="btn-secondary" onClick={onClose}>
                Back to Module
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (mode === "wrong-answers") {
    return (
      <div className="practice-overlay" onClick={onClose}>
        <div className="practice-modal" onClick={(e) => e.stopPropagation()}>
          <button className="practice-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="practice-header">
            <div className="practice-label">Wrong Answers Review</div>
            <h2 className="practice-module-title">{moduleTitle}</h2>
          </div>
          <div className="practice-wrong-list">
            {wrongAnswers.map((wa, i) => {
              const correctIdx = wa.block.options.findIndex((o) => o.correct);
              return (
                <div key={i} className="practice-wrong-item">
                  {wa.block.scenario && (
                    <p className="practice-scenario">{wa.block.scenario}</p>
                  )}
                  <p className="practice-question-text">{wa.block.question}</p>
                  <div className="practice-wrong-answers">
                    {wa.selectedOption >= 0 && (
                      <div className="practice-wrong-answer practice-wrong-your">
                        <XCircle />
                        <div>
                          <span className="practice-answer-label">Your answer:</span>
                          <span>{wa.block.options[wa.selectedOption]?.text}</span>
                          {wa.block.options[wa.selectedOption]?.explanation && (
                            <p className="practice-explanation">{wa.block.options[wa.selectedOption].explanation}</p>
                          )}
                        </div>
                      </div>
                    )}
                    {correctIdx >= 0 && (
                      <div className="practice-wrong-answer practice-correct-answer">
                        <CheckCircle />
                        <div>
                          <span className="practice-answer-label">Correct answer:</span>
                          <span>{wa.block.options[correctIdx].text}</span>
                          {wa.block.options[correctIdx].explanation && (
                            <p className="practice-explanation">{wa.block.options[correctIdx].explanation}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center", padding: "1.5rem 0 0.5rem" }}>
            <button className="btn-primary" onClick={() => handleRetry(true)}>
              Retry Wrong Answers ({wrongAnswers.length})
            </button>
            <button className="btn-secondary" onClick={() => setMode("summary")}>
              Back to Summary
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!current) return null;

  const correctIndex = current.options.findIndex((o) => o.correct);
  const isCorrect = selected !== null && current.options[selected]?.correct === true;
  const progress = Math.round((currentQuestion / totalQ) * 100);

  return (
    <div className="practice-overlay" onClick={onClose}>
      <div className="practice-modal" onClick={(e) => e.stopPropagation()}>
        <button className="practice-close" onClick={onClose} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="practice-header">
          <div className="practice-label">Practice Quiz</div>
          <h2 className="practice-module-title">{moduleTitle}</h2>
          <div className="practice-progress-row">
            <div className="practice-progress-bar">
              <div className="practice-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="practice-counter">{currentQuestion + 1} / {totalQ}</span>
          </div>
        </div>

        <div className="practice-question-area">
          {current.scenario && (
            <div className="practice-scenario-box">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p>{current.scenario}</p>
            </div>
          )}
          <p className="practice-question-text">{current.question}</p>

          <div className="practice-options">
            {current.options.map((opt, i) => {
              let cls = "practice-option";
              if (revealed && opt.correct) cls += " practice-option-correct";
              if (revealed && selected === i && !opt.correct) cls += " practice-option-wrong";
              if (!revealed) cls += " practice-option-clickable";

              return (
                <button
                  key={i}
                  className={cls}
                  onClick={() => handleSelect(i)}
                  disabled={revealed}
                >
                  <span className={`practice-option-letter ${revealed && opt.correct ? "practice-letter-correct" : ""} ${revealed && selected === i && !opt.correct ? "practice-letter-wrong" : ""}`}>
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="practice-option-text">{opt.text}</span>
                  {revealed && opt.correct && <CheckCircle />}
                  {revealed && selected === i && !opt.correct && <XCircle />}
                </button>
              );
            })}
          </div>

          {revealed && selected !== null && (
            <div className={`practice-feedback ${isCorrect ? "practice-feedback-correct" : "practice-feedback-wrong"}`}>
              <div className="practice-feedback-header">
                {isCorrect ? <><CheckCircle /> <strong>Correct!</strong></> : <><XCircle /> <strong>Not quite.</strong></>}
              </div>
              <p>{current.options[selected].explanation}</p>
              {!isCorrect && correctIndex >= 0 && (
                <p className="practice-correct-note">
                  Correct answer: <strong>{String.fromCharCode(65 + correctIndex)}: {current.options[correctIndex].text}</strong>
                </p>
              )}
            </div>
          )}
        </div>

        <div className="practice-footer">
          {!revealed ? (
            <p className="practice-hint">Press 1–{current.options.length} to select · Esc to exit</p>
          ) : (
            <button className="btn-primary" onClick={handleNext}>
              {currentQuestion + 1 >= totalQ ? "See Results" : "Next Question"}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
