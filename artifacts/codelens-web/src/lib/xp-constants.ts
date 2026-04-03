export const XP_AMOUNTS = {
  module_read: 10,
  quiz_pass: 25,
  flashcard_session: 15,
  course_complete: 100,
} as const;

export type XpEventType = keyof typeof XP_AMOUNTS;

export interface LevelInfo {
  level: number;
  name: string;
  xpRequired: number;
}

const LEVEL_NAMES: Record<number, string> = {
  1: "Newcomer",
  2: "Curious Learner",
  3: "Code Explorer",
  4: "Apprentice Dev",
  5: "Script Kiddie",
  6: "Bug Squasher",
  7: "Syntax Warrior",
  8: "Logic Builder",
  9: "Module Master",
  10: "Junior Dev",
  11: "Stack Apprentice",
  12: "API Wrangler",
  13: "Debug Knight",
  14: "Code Artisan",
  15: "Mid-Level Dev",
  16: "Pattern Seeker",
  17: "Refactor Sage",
  18: "System Thinker",
  19: "Architecture Buff",
  20: "Senior Dev",
  21: "Code Mentor",
  22: "Tech Lead",
  23: "Pipeline Pro",
  24: "Scale Engineer",
  25: "Principal Dev",
  26: "Framework Guru",
  27: "Cloud Architect",
  28: "Infra Wizard",
  29: "Platform Expert",
  30: "Staff Engineer",
  31: "Domain Expert",
  32: "System Architect",
  33: "Open Source Hero",
  34: "Performance Ninja",
  35: "Security Sentinel",
  36: "Data Sage",
  37: "ML Practitioner",
  38: "DevOps Master",
  39: "Full Stack Legend",
  40: "Distinguished Engineer",
  41: "Tech Visionary",
  42: "Innovation Lead",
  43: "Code Philosopher",
  44: "Engineering Fellow",
  45: "Thought Leader",
  46: "Industry Expert",
  47: "Titan of Code",
  48: "Legendary Dev",
  49: "Grandmaster",
  50: "Transcendent",
};

function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(50 * Math.pow(level, 2.2));
}

export const LEVELS: LevelInfo[] = Array.from({ length: 50 }, (_, i) => ({
  level: i + 1,
  name: LEVEL_NAMES[i + 1] || `Level ${i + 1}`,
  xpRequired: xpForLevel(i + 1),
}));

export function getLevelForXp(totalXp: number): LevelInfo {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (totalXp >= lvl.xpRequired) {
      current = lvl;
    } else {
      break;
    }
  }
  return current;
}

export function getXpToNextLevel(totalXp: number): { current: LevelInfo; next: LevelInfo | null; xpNeeded: number; progress: number } {
  const current = getLevelForXp(totalXp);
  const nextIndex = LEVELS.findIndex((l) => l.level === current.level + 1);
  if (nextIndex === -1) {
    return { current, next: null, xpNeeded: 0, progress: 100 };
  }
  const next = LEVELS[nextIndex];
  const xpInLevel = totalXp - current.xpRequired;
  const levelRange = next.xpRequired - current.xpRequired;
  const progress = Math.min(100, Math.round((xpInLevel / levelRange) * 100));
  return { current, next, xpNeeded: next.xpRequired - totalXp, progress };
}

export interface BadgeDefinition {
  key: string;
  name: string;
  description: string;
  icon: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { key: "first_course", name: "First Course Complete", description: "Completed your first course", icon: "🎓" },
  { key: "streak_7", name: "7-Day Streak", description: "Maintained a 7-day learning streak", icon: "🔥" },
  { key: "streak_30", name: "30-Day Streak", description: "Maintained a 30-day learning streak", icon: "💎" },
  { key: "quiz_master", name: "Quiz Master", description: "Scored 80%+ on 5 quizzes", icon: "🧠" },
  { key: "xp_1000", name: "XP Milestone: 1K", description: "Earned 1,000 total XP", icon: "⚡" },
  { key: "xp_10000", name: "XP Milestone: 10K", description: "Earned 10,000 total XP", icon: "🌟" },
  { key: "module_50", name: "Half Century", description: "Completed 50 modules", icon: "📚" },
  { key: "course_5", name: "Course Collector", description: "Completed 5 courses", icon: "🏆" },
];

export function getBadgeDefinition(key: string): BadgeDefinition | undefined {
  return BADGE_DEFINITIONS.find((b) => b.key === key);
}
