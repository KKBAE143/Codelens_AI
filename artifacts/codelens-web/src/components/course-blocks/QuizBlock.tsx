"use client";

import { useState } from "react";
import type { V2QuizBlock } from "@/lib/course-types";

function CheckCircle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function XCircle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

export function QuizBlock({ block }: { block: V2QuizBlock }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const handleSelect = (i: number) => {
    if (revealed) return;
    setSelected(i);
    setRevealed(true);
  };

  const handleReset = () => {
    setSelected(null);
    setRevealed(false);
  };

  const correctIndex = block.options.findIndex((o) => o.correct);

  return (
    <div className="v2-quiz-block">
      <div className="v2-quiz-header">
        <span className="v2-quiz-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle", marginRight: 4 }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Quiz
        </span>
        {revealed && (
          <button className="v2-quiz-retry" onClick={handleReset}>
            Try Again
          </button>
        )}
      </div>
      {block.scenario && <p className="v2-quiz-scenario">{block.scenario}</p>}
      <p className="v2-quiz-question">{block.question}</p>
      <div className="v2-quiz-options">
        {block.options.map((opt, i) => {
          let optClass = "v2-quiz-option";
          if (revealed && opt.correct) optClass += " v2-quiz-option-correct";
          if (revealed && selected === i && !opt.correct) optClass += " v2-quiz-option-wrong";
          if (!revealed) optClass += " v2-quiz-option-clickable";

          return (
            <button
              key={i}
              className={optClass}
              onClick={() => handleSelect(i)}
              disabled={revealed}
            >
              <span className={`v2-quiz-option-letter ${revealed && opt.correct ? "v2-quiz-letter-correct" : ""} ${revealed && selected === i && !opt.correct ? "v2-quiz-letter-wrong" : ""}`}>
                {String.fromCharCode(65 + i)}
              </span>
              <span className="v2-quiz-option-text">{opt.text}</span>
              {revealed && opt.correct && <CheckCircle />}
              {revealed && selected === i && !opt.correct && <XCircle />}
            </button>
          );
        })}
      </div>
      {revealed && selected !== null && (
        <div className={`v2-quiz-explanation ${block.options[selected].correct ? "v2-quiz-explanation-correct" : "v2-quiz-explanation-wrong"}`}>
          <div className="v2-quiz-explanation-header">
            {block.options[selected].correct ? (
              <><CheckCircle /> <strong>Correct!</strong></>
            ) : (
              <><XCircle /> <strong>Not quite.</strong></>
            )}
          </div>
          <p>{block.options[selected].explanation}</p>
          {!block.options[selected].correct && correctIndex >= 0 && (
            <p className="v2-quiz-correct-answer">
              The correct answer is <strong>{String.fromCharCode(65 + correctIndex)}: {block.options[correctIndex].text}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
