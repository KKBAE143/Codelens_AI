"use client";

import { useEffect, useState } from "react";

interface LevelUpModalProps {
  level: number;
  levelName: string;
  onClose: () => void;
}

export function LevelUpModal({ level, levelName, onClose }: LevelUpModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 400);
    }, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className="level-up-overlay"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}
      onClick={() => { setVisible(false); setTimeout(onClose, 400); }}
    >
      <div
        className="level-up-modal"
        style={{
          transform: visible ? "scale(1)" : "scale(0.7)",
          transition: "transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="level-up-glow" />
        <div className="level-up-badge">
          <span className="level-up-badge-number">{level}</span>
        </div>
        <h2 className="level-up-title">Level Up!</h2>
        <p className="level-up-subtitle">
          You reached <strong>Level {level}</strong>
        </p>
        <p className="level-up-name">{levelName}</p>
        <button className="btn-primary level-up-btn" onClick={() => { setVisible(false); setTimeout(onClose, 400); }}>
          Continue
        </button>
      </div>
    </div>
  );
}
