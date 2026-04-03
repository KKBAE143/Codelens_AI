export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { userXpEvents, userStreaks, userBadges, users } from "@workspace/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";
import { getLevelForXp, getXpToNextLevel, getBadgeDefinition } from "@/lib/xp-constants";

function getTodayStartUtc(tz: string): Date {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayStr = formatter.format(new Date());
    const parts = todayStr.split("-").map(Number);
    const localMidnight = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    const offsetMs = getTimezoneOffsetMs(tz);
    return new Date(localMidnight.getTime() - offsetMs);
  } catch {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    return now;
  }
}

function getTimezoneOffsetMs(tz: string): number {
  try {
    const now = new Date();
    const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" });
    const tzStr = now.toLocaleString("en-US", { timeZone: tz });
    return new Date(tzStr).getTime() - new Date(utcStr).getTime();
  } catch {
    return 0;
  }
}

export async function GET(request: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let clientTz = request.headers.get("x-timezone") || "";

  if (!clientTz) {
    const [userRow] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, user.id)).limit(1);
    clientTz = userRow?.timezone || "UTC";
  } else {
    db.update(users)
      .set({ timezone: clientTz, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .catch(() => {});
  }

  const todayStart = getTodayStartUtc(clientTz);

  const oneYearAgo = new Date();
  oneYearAgo.setDate(oneYearAgo.getDate() - 365);

  const [streakRow, events, xpByType, badges, todayXpResult] = await Promise.all([
    db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, user.id))
      .limit(1)
      .then((r) => r[0] ?? null),

    db
      .select({
        createdAt: userXpEvents.createdAt,
        points: userXpEvents.points,
        eventType: userXpEvents.eventType,
      })
      .from(userXpEvents)
      .where(eq(userXpEvents.userId, user.id))
      .orderBy(userXpEvents.createdAt),

    db
      .select({
        eventType: userXpEvents.eventType,
        totalPoints: sql<number>`sum(${userXpEvents.points})::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(userXpEvents)
      .where(eq(userXpEvents.userId, user.id))
      .groupBy(userXpEvents.eventType),

    db
      .select({ badgeKey: userBadges.badgeKey, awardedAt: userBadges.awardedAt })
      .from(userBadges)
      .where(eq(userBadges.userId, user.id))
      .orderBy(userBadges.awardedAt),

    db
      .select({ total: sql<number>`COALESCE(sum(${userXpEvents.points}), 0)::int` })
      .from(userXpEvents)
      .where(
        and(
          eq(userXpEvents.userId, user.id),
          gte(userXpEvents.createdAt, todayStart),
        ),
      )
      .then((r) => r[0]?.total ?? 0),
  ]);

  const totalXp = events.reduce((sum, e) => sum + (e.points ?? 0), 0);

  const dateFormatter = (() => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: clientTz, year: "numeric", month: "2-digit", day: "2-digit" });
    } catch {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" });
    }
  })();

  const activityMap: Record<string, number> = {};
  for (const e of events) {
    if (e.createdAt) {
      const dateStr = dateFormatter.format(new Date(e.createdAt));
      activityMap[dateStr] = (activityMap[dateStr] ?? 0) + (e.points ?? 0);
    }
  }

  const yearAgoStr = oneYearAgo.toISOString().split("T")[0];
  const recentActivity = Object.entries(activityMap)
    .filter(([date]) => date >= yearAgoStr)
    .map(([date, points]) => ({ date, points }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const levelInfo = getXpToNextLevel(totalXp);
  const currentLevel = getLevelForXp(totalXp);

  const badgesWithMeta = badges.map((b) => {
    const def = getBadgeDefinition(b.badgeKey);
    return {
      key: b.badgeKey,
      name: def?.name ?? b.badgeKey,
      description: def?.description ?? "",
      icon: def?.icon ?? "🏅",
      awardedAt: b.awardedAt,
    };
  });

  return NextResponse.json({
    totalXp,
    currentStreak: streakRow?.currentStreak ?? 0,
    longestStreak: streakRow?.longestStreak ?? 0,
    lastActiveDate: streakRow?.lastActiveDate ?? null,
    streakShieldActive: streakRow?.streakShieldActive ?? false,
    todayXp: todayXpResult,
    level: currentLevel.level,
    levelName: currentLevel.name,
    xpToNextLevel: levelInfo.xpNeeded,
    levelProgress: levelInfo.progress,
    nextLevelXp: levelInfo.next?.xpRequired ?? null,
    currentLevelXp: currentLevel.xpRequired,
    xpByType: xpByType.map((r) => ({ eventType: r.eventType, totalPoints: r.totalPoints, count: r.count })),
    recentActivity,
    badges: badgesWithMeta,
  });
}
