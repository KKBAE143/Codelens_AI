"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

interface StatsData {
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  streakShieldActive: boolean;
  todayXp: number;
  level: number;
  levelName: string;
  xpToNextLevel: number;
  levelProgress: number;
}

async function fetchStats(): Promise<StatsData | null> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const res = await fetch("/api/users/me/stats", {
    credentials: "include",
    headers: { "x-timezone": tz },
  });
  if (!res.ok) return null;
  return res.json();
}

export function XpStreakBadge() {
  const { data: stats } = useQuery({
    queryKey: ["user-stats"],
    queryFn: fetchStats,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        badgeRef.current &&
        !badgeRef.current.contains(e.target as Node)
      ) {
        setShowPopover(false);
      }
    }
    if (showPopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showPopover]);

  if (!stats) return null;

  const streak = stats.currentStreak;

  return (
    <div className="xp-badge-wrapper" ref={badgeRef}>
      <div
        className="xp-streak-badge"
        title={`Level ${stats.level} · ${stats.totalXp} XP · ${streak}-day streak`}
        onClick={() => setShowPopover((p) => !p)}
        style={{ cursor: "pointer" }}
      >
        {streak > 0 && (
          <span className="xp-streak-flame xp-streak-active">
            🔥 <span className="xp-streak-count">{streak}</span>
          </span>
        )}
        <span className="xp-total">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: "middle" }}>
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          {stats.totalXp.toLocaleString()}
        </span>
        {stats.streakShieldActive && (
          <span className="xp-shield-icon" title="Streak shield active">🛡️</span>
        )}
      </div>

      {showPopover && (
        <div className="xp-popover" ref={popoverRef}>
          <div className="xp-popover-header">
            <span className="xp-popover-level">Level {stats.level}</span>
            <span className="xp-popover-level-name">{stats.levelName}</span>
          </div>

          <div className="xp-popover-progress-wrap">
            <div className="xp-popover-progress-bar">
              <div
                className="xp-popover-progress-fill"
                style={{ width: `${stats.levelProgress}%` }}
              />
            </div>
            <div className="xp-popover-progress-text">
              {stats.xpToNextLevel > 0
                ? `${stats.xpToNextLevel.toLocaleString()} XP to next level`
                : "Max level reached!"}
            </div>
          </div>

          <div className="xp-popover-stats">
            <div className="xp-popover-stat">
              <span className="xp-popover-stat-label">Today</span>
              <span className="xp-popover-stat-value">+{stats.todayXp} XP</span>
            </div>
            <div className="xp-popover-stat">
              <span className="xp-popover-stat-label">Streak</span>
              <span className="xp-popover-stat-value">
                🔥 {streak} day{streak !== 1 ? "s" : ""}
              </span>
            </div>
            {stats.streakShieldActive && (
              <div className="xp-popover-stat">
                <span className="xp-popover-stat-label">Shield</span>
                <span className="xp-popover-stat-value">🛡️ Active</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
