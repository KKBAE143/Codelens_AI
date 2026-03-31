"use client";

import { useState } from "react";
import type { V2QuizBlock } from "@/lib/course-types";

export function QuizBlock({ block }: { block: V2QuizBlock }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const handleSelect = (i: number) => {
    if (revealed) return;
    setSelected(i);
  };

  const handleCheck = () => {
    if (selected === null) return;
    setRevealed(true);
  };

  return (
    <div className="v2-quiz-block">
      <div className="v2-quiz-header">
        <span className="v2-quiz-icon">Quiz</span>
      </div>
      {block.scenario && <p className="v2-quiz-scenario">{block.scenario}</p>}
      <p className="v2-quiz-question">{block.question}</p>
      <div className="v2-quiz-options">
        {block.options.map((opt, i) => {
          let optClass = "v2-quiz-option";
          if (selected === i && !revealed) optClass += " v2-quiz-option-selected";
          if (revealed && opt.correct) optClass += " v2-quiz-option-correct";
          if (revealed && selected === i && !opt.correct) optClass += " v2-quiz-option-wrong";

          return (
            <button
              key={i}
              className={optClass}
              onClick={() => handleSelect(i)}
              disabled={revealed}
            >
              <span className="v2-quiz-option-letter">{String.fromCharCode(65 + i)}</span>
              <span className="v2-quiz-option-text">{opt.text}</span>
              {revealed && selected === i && (
                <span className="v2-quiz-option-indicator">{opt.correct ? "Correct" : "Incorrect"}</span>
              )}
            </button>
          );
        })}
      </div>
      {!revealed && (
        <button className="v2-quiz-check" onClick={handleCheck} disabled={selected === null}>
          Check Answer
        </button>
      )}
      {revealed && selected !== null && (
        <div className={`v2-quiz-explanation ${block.options[selected].correct ? "v2-quiz-explanation-correct" : "v2-quiz-explanation-wrong"}`}>
          <strong>{block.options[selected].correct ? "Correct!" : "Not quite."}</strong>{" "}
          {block.options[selected].explanation}
        </div>
      )}
    </div>
  );
}
