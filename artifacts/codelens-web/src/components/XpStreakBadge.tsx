"use client";

import { useState, useEffect } from "react";

interface StatsData {
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
}

export function XpStreakBadge() {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    fetch("/api/users/me/stats", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setStats(data as StatsData);
      })
      .catch(() => {});
  }, []);

  if (!stats) return null;

  const today = new Date().toISOString().split("T")[0];
  const isActiveToday = stats.lastActiveDate === today;
  const streak = stats.currentStreak;

  return (
    <div className="xp-streak-badge" title={`${stats.totalXp} XP · ${streak}-day streak`}>
      {streak > 0 && (
        <span className={`xp-streak-flame ${isActiveToday ? "xp-streak-active" : "xp-streak-inactive"}`}>
          🔥 <span className="xp-streak-count">{streak}</span>
        </span>
      )}
      <span className="xp-total">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ verticalAlign: "middle" }}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        {stats.totalXp.toLocaleString()}
      </span>
    </div>
  );
}
