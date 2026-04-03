import { db } from "@workspace/db";
import { userXpEvents, userStreaks, userBadges, users } from "@workspace/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { XP_AMOUNTS, type XpEventType, getLevelForXp, getXpToNextLevel } from "./xp-constants";

export { XP_AMOUNTS, type XpEventType } from "./xp-constants";

function getDateInTimezone(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

function getYesterdayInTimezone(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayStr = formatter.format(now);
    const todayDate = new Date(todayStr + "T12:00:00Z");
    todayDate.setDate(todayDate.getDate() - 1);
    return todayDate.toISOString().split("T")[0];
  } catch {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }
}

function getDayBeforeYesterdayInTimezone(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayStr = formatter.format(now);
    const todayDate = new Date(todayStr + "T12:00:00Z");
    todayDate.setDate(todayDate.getDate() - 2);
    return todayDate.toISOString().split("T")[0];
  } catch {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toISOString().split("T")[0];
  }
}

export interface AwardXpResult {
  points: number;
  newStreak: number;
  totalXp: number;
  leveledUp: boolean;
  newLevel: number;
  newLevelName: string;
  streakShieldActive: boolean;
  newBadges: string[];
}

export async function awardXp(
  userId: string,
  eventType: XpEventType,
  courseId?: string,
  moduleIndex?: number,
  clientTimezone?: string,
): Promise<AwardXpResult> {
  const points = XP_AMOUNTS[eventType];

  let tz = clientTimezone || "";
  if (!tz) {
    const [userRow] = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    tz = userRow?.timezone || "UTC";
  }

  const today = getDateInTimezone(tz);
  const yesterday = getYesterdayInTimezone(tz);
  const dayBeforeYesterday = getDayBeforeYesterdayInTimezone(tz);

  const result = await db.transaction(async (tx) => {
    if (eventType === "quiz_pass" && moduleIndex != null) {
      const insertResult = await tx.insert(userXpEvents).values({
        userId,
        courseId: courseId ?? null,
        eventType,
        moduleIndex,
        points,
      }).onConflictDoNothing();
      if (insertResult.rowCount === 0) {
        const [streakRow] = await tx
          .select()
          .from(userStreaks)
          .where(eq(userStreaks.userId, userId))
          .limit(1);
        const [xpSum] = await tx
          .select({ total: sql<number>`COALESCE(sum(${userXpEvents.points}), 0)::int` })
          .from(userXpEvents)
          .where(eq(userXpEvents.userId, userId));
        return {
          points: 0,
          newStreak: streakRow?.currentStreak ?? 0,
          totalXp: xpSum?.total ?? 0,
          leveledUp: false,
          newLevel: getLevelForXp(xpSum?.total ?? 0).level,
          newLevelName: getLevelForXp(xpSum?.total ?? 0).name,
          streakShieldActive: streakRow?.streakShieldActive ?? false,
          newBadges: [] as string[],
        };
      }
    } else {
      await tx.insert(userXpEvents).values({
        userId,
        courseId: courseId ?? null,
        eventType,
        moduleIndex: moduleIndex ?? null,
        points,
      });
    }

    const [existing] = await tx
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, userId))
      .limit(1)
      .for("update");

    let newStreak: number;
    let streakShieldActive: boolean;

    if (existing) {
      if (existing.lastActiveDate === today) {
        newStreak = existing.currentStreak;
        streakShieldActive = existing.streakShieldActive;
      } else if (existing.lastActiveDate === yesterday) {
        newStreak = (existing.currentStreak ?? 0) + 1;
        const prevStreak = existing.currentStreak ?? 0;
        const crossedNewMilestone = Math.floor(newStreak / 7) > Math.floor(prevStreak / 7);
        streakShieldActive = existing.streakShieldActive || (crossedNewMilestone && newStreak >= 7);
        const longestStreak = Math.max(newStreak, existing.longestStreak ?? 0);
        await tx
          .update(userStreaks)
          .set({
            currentStreak: newStreak,
            longestStreak,
            lastActiveDate: today,
            streakShieldActive,
            updatedAt: new Date(),
          })
          .where(eq(userStreaks.userId, userId));
      } else if (
        existing.streakShieldActive &&
        existing.lastActiveDate === dayBeforeYesterday
      ) {
        newStreak = (existing.currentStreak ?? 0) + 1;
        streakShieldActive = false;
        const longestStreak = Math.max(newStreak, existing.longestStreak ?? 0);
        await tx
          .update(userStreaks)
          .set({
            currentStreak: newStreak,
            longestStreak,
            lastActiveDate: today,
            streakShieldActive: false,
            streakShieldUsedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(userStreaks.userId, userId));
      } else {
        newStreak = 1;
        streakShieldActive = false;
        await tx
          .update(userStreaks)
          .set({
            currentStreak: 1,
            lastActiveDate: today,
            streakShieldActive: false,
            updatedAt: new Date(),
          })
          .where(eq(userStreaks.userId, userId));
      }
    } else {
      newStreak = 1;
      streakShieldActive = false;
      await tx
        .insert(userStreaks)
        .values({
          userId,
          currentStreak: 1,
          longestStreak: 1,
          lastActiveDate: today,
          streakShieldActive: false,
        })
        .onConflictDoUpdate({
          target: userStreaks.userId,
          set: {
            currentStreak: 1,
            lastActiveDate: today,
            updatedAt: new Date(),
          },
        });
    }

    const [xpSum] = await tx
      .select({ total: sql<number>`COALESCE(sum(${userXpEvents.points}), 0)::int` })
      .from(userXpEvents)
      .where(eq(userXpEvents.userId, userId));
    const totalXp = xpSum?.total ?? 0;

    const prevXp = totalXp - points;
    const prevLevel = getLevelForXp(prevXp);
    const currentLevel = getLevelForXp(totalXp);
    const leveledUp = currentLevel.level > prevLevel.level;

    return {
      points,
      newStreak,
      totalXp,
      leveledUp,
      newLevel: currentLevel.level,
      newLevelName: currentLevel.name,
      streakShieldActive,
      newBadges: [] as string[],
    };
  });

  const newBadges = await checkAndAwardBadges(userId, result.totalXp, result.newStreak);
  result.newBadges = newBadges;

  return result;
}

async function checkAndAwardBadges(userId: string, totalXp: number, currentStreak: number): Promise<string[]> {
  const awarded: string[] = [];

  const existingBadges = await db
    .select({ badgeKey: userBadges.badgeKey })
    .from(userBadges)
    .where(eq(userBadges.userId, userId));
  const hasBadge = new Set(existingBadges.map((b) => b.badgeKey));

  const checks: Array<{ key: string; condition: () => Promise<boolean> | boolean }> = [
    {
      key: "first_course",
      condition: async () => {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(userXpEvents)
          .where(and(eq(userXpEvents.userId, userId), eq(userXpEvents.eventType, "course_complete")));
        return (row?.count ?? 0) >= 1;
      },
    },
    { key: "streak_7", condition: () => currentStreak >= 7 },
    { key: "streak_30", condition: () => currentStreak >= 30 },
    {
      key: "quiz_master",
      condition: async () => {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(userXpEvents)
          .where(and(eq(userXpEvents.userId, userId), eq(userXpEvents.eventType, "quiz_pass")));
        return (row?.count ?? 0) >= 5;
      },
    },
    { key: "xp_1000", condition: () => totalXp >= 1000 },
    { key: "xp_10000", condition: () => totalXp >= 10000 },
    {
      key: "module_50",
      condition: async () => {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(userXpEvents)
          .where(and(eq(userXpEvents.userId, userId), eq(userXpEvents.eventType, "module_read")));
        return (row?.count ?? 0) >= 50;
      },
    },
    {
      key: "course_5",
      condition: async () => {
        const [row] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(userXpEvents)
          .where(and(eq(userXpEvents.userId, userId), eq(userXpEvents.eventType, "course_complete")));
        return (row?.count ?? 0) >= 5;
      },
    },
  ];

  for (const { key, condition } of checks) {
    if (hasBadge.has(key)) continue;
    const met = await condition();
    if (met) {
      try {
        await db
          .insert(userBadges)
          .values({ userId, badgeKey: key })
          .onConflictDoNothing();
        awarded.push(key);
      } catch {}
    }
  }

  return awarded;
}

