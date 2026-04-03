"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { BADGE_DEFINITIONS } from "@/lib/xp-constants";

interface BadgeData {
  key: string;
  name: string;
  description: string;
  icon: string;
  awardedAt: string;
}

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
  nextLevelXp: number | null;
  currentLevelXp: number;
  xpByType: Array<{ eventType: string; totalPoints: number; count: number }>;
  recentActivity: Array<{ date: string; points: number }>;
  badges: BadgeData[];
}

const EVENT_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  module_read: { label: "Modules Completed", emoji: "\u{1F4D6}", color: "var(--accent)" },
  quiz_pass: { label: "Quizzes Passed", emoji: "\u{2705}", color: "var(--teal)" },
  flashcard_session: { label: "Flashcard Sessions", emoji: "\u{1F0CF}", color: "#8B5CF6" },
  course_complete: { label: "Courses Finished", emoji: "\u{1F393}", color: "#F59E0B" },
};

function ActivityHeatmap({ activity }: { activity: Array<{ date: string; points: number }> }) {
  const today = new Date();
  const days: Array<{ date: string; points: number; dayOfWeek: number }> = [];

  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const entry = activity.find((a) => a.date === dateStr);
    days.push({ date: dateStr, points: entry?.points ?? 0, dayOfWeek: d.getDay() });
  }

  const maxPoints = Math.max(...days.map((d) => d.points), 1);

  const weeks: typeof days[] = [];
  let currentWeek: typeof days = [];

  if (days[0].dayOfWeek !== 0) {
    for (let i = 0; i < days[0].dayOfWeek; i++) {
      currentWeek.push({ date: "", points: 0, dayOfWeek: i });
    }
  }

  for (const day of days) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const getColor = (points: number) => {
    if (points === 0) return "var(--bg-tertiary)";
    const intensity = points / maxPoints;
    if (intensity < 0.25) return "rgba(99,102,241,0.25)";
    if (intensity < 0.5) return "rgba(99,102,241,0.5)";
    if (intensity < 0.75) return "rgba(99,102,241,0.75)";
    return "var(--accent)";
  };

  const monthLabels: Array<{ label: string; weekIndex: number }> = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstRealDay = week.find((d) => d.date);
    if (firstRealDay) {
      const m = new Date(firstRealDay.date).getMonth();
      if (m !== lastMonth) {
        monthLabels.push({ label: new Date(firstRealDay.date).toLocaleDateString("en", { month: "short" }), weekIndex: wi });
        lastMonth = m;
      }
    }
  });

  return (
    <div className="heatmap-container">
      <div className="heatmap-months">
        {monthLabels.map((ml) => (
          <span key={ml.weekIndex} className="heatmap-month-label" style={{ left: `${(ml.weekIndex / weeks.length) * 100}%` }}>
            {ml.label}
          </span>
        ))}
      </div>
      <div className="heatmap-grid">
        {weeks.map((week, wi) => (
          <div key={wi} className="heatmap-week">
            {week.map((day, di) => (
              <div
                key={di}
                className="heatmap-cell"
                style={{ background: day.date ? getColor(day.points) : "transparent" }}
                title={day.date ? `${day.date}: ${day.points} XP` : ""}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="heatmap-legend">
        <span className="heatmap-legend-label">Less</span>
        {[0, 0.25, 0.5, 0.75, 1].map((level) => (
          <div key={level} className="heatmap-cell" style={{ background: getColor(level * maxPoints) }} />
        ))}
        <span className="heatmap-legend-label">More</span>
      </div>
    </div>
  );
}

function BadgeShelf({ badges }: { badges: BadgeData[] }) {
  const awardedKeys = new Set(badges.map((b) => b.key));

  return (
    <div className="badge-shelf">
      {BADGE_DEFINITIONS.map((def) => {
        const awarded = awardedKeys.has(def.key);
        const badge = badges.find((b) => b.key === def.key);
        return (
          <div
            key={def.key}
            className={`badge-item ${awarded ? "" : "badge-item-locked"}`}
            title={awarded ? `${def.name}: ${def.description}` : `${def.name} (Locked) — ${def.description}`}
          >
            <span className="badge-item-icon">{def.icon}</span>
            <span className="badge-item-name">{def.name}</span>
            {awarded && badge && (
              <span className="badge-item-date">
                {new Date(badge.awardedAt).toLocaleDateString("en", { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function StatsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const tz = typeof window !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    : "UTC";

  const { data: stats, isLoading } = useQuery<StatsData>({
    queryKey: ["user-stats"],
    queryFn: async () => {
      const res = await fetch("/api/users/me/stats", {
        credentials: "include",
        headers: { "x-timezone": tz },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push("/");
  }, [authLoading, isAuthenticated, router]);

  if (isLoading || authLoading) {
    return (
      <main className="stats-page">
        <div className="stats-header">
          <div className="skeleton" style={{ width: 200, height: 32, borderRadius: "var(--radius-sm)" }} />
        </div>
        <div className="stats-cards">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 100, borderRadius: "var(--radius-md)" }} />
          ))}
        </div>
      </main>
    );
  }

  if (!stats) {
    return (
      <main className="stats-page">
        <div className="stats-header">
          <button className="btn-ghost" onClick={() => router.back()} style={{ marginBottom: "1rem" }}>
            &larr; Back
          </button>
          <h1 className="stats-title">Your Stats</h1>
        </div>
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>&#x1F4CA;</div>
          <p>No activity yet. Complete your first module to start earning XP!</p>
        </div>
      </main>
    );
  }

  const totalEvents = stats.xpByType.reduce((s, r) => s + r.count, 0);

  return (
    <main className="stats-page">
      <div className="stats-header">
        <button className="btn-ghost" onClick={() => router.back()} style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
          &larr; Back
        </button>
        <h1 className="stats-title">Your Progress</h1>
        <p className="stats-subtitle">Keep learning &mdash; every module counts.</p>
      </div>

      <div className="level-progress-panel">
        <div className="level-progress-badge">
          <span className="level-progress-badge-num">{stats.level}</span>
        </div>
        <div className="level-progress-info">
          <div className="level-progress-title">Level {stats.level}</div>
          <div className="level-progress-name">{stats.levelName}</div>
          <div className="level-progress-bar">
            <div className="level-progress-fill" style={{ width: `${stats.levelProgress}%` }} />
          </div>
          <div className="level-progress-text">
            {stats.xpToNextLevel > 0
              ? `${stats.totalXp.toLocaleString()} / ${(stats.nextLevelXp ?? 0).toLocaleString()} XP (${stats.xpToNextLevel.toLocaleString()} to next level)`
              : `${stats.totalXp.toLocaleString()} XP — Max level reached!`}
          </div>
        </div>
      </div>

      <div className="stats-cards">
        <div className="stats-card">
          <div className="stats-card-icon">&#x26A1;</div>
          <div className="stats-card-value">{stats.totalXp.toLocaleString()}</div>
          <div className="stats-card-label">Total XP</div>
        </div>
        <div className="stats-card">
          <div className="stats-card-icon">&#x1F4C5;</div>
          <div className="stats-card-value">+{stats.todayXp}</div>
          <div className="stats-card-label">Today's XP</div>
        </div>
        <div className={`stats-card ${stats.currentStreak > 0 ? "stats-card-active" : ""}`}>
          <div className="stats-card-icon">&#x1F525;</div>
          <div className="stats-card-value">{stats.currentStreak}</div>
          <div className="stats-card-label">
            Day Streak
            {stats.streakShieldActive && <span className="stats-card-badge">&#x1F6E1;&#xFE0F; Shield</span>}
          </div>
        </div>
        <div className="stats-card">
          <div className="stats-card-icon">&#x1F3C6;</div>
          <div className="stats-card-value">{stats.longestStreak}</div>
          <div className="stats-card-label">Longest Streak</div>
        </div>
      </div>

      <section className="stats-section">
        <h2 className="stats-section-title">Badges</h2>
        <div className="stats-section-body">
          <BadgeShelf badges={stats.badges} />
        </div>
      </section>

      <section className="stats-section">
        <h2 className="stats-section-title">Activity &mdash; Last 365 Days</h2>
        <div className="stats-section-body">
          <ActivityHeatmap activity={stats.recentActivity} />
        </div>
      </section>

      <section className="stats-section">
        <h2 className="stats-section-title">XP Breakdown</h2>
        <div className="stats-breakdown-list">
          {stats.xpByType.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", padding: "1rem 0" }}>No XP events yet.</p>
          ) : (
            stats.xpByType.map((row) => {
              const config = EVENT_LABELS[row.eventType] ?? { label: row.eventType, emoji: "\u2B50", color: "var(--text-primary)" };
              return (
                <div key={row.eventType} className="stats-breakdown-row">
                  <span className="stats-breakdown-emoji">{config.emoji}</span>
                  <div className="stats-breakdown-info">
                    <span className="stats-breakdown-label">{config.label}</span>
                    <span className="stats-breakdown-count">{row.count}x</span>
                  </div>
                  <span className="stats-breakdown-xp" style={{ color: config.color }}>
                    +{row.totalPoints.toLocaleString()} XP
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
