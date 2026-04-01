export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { userXpEvents, userStreaks } from "@workspace/db/schema";
import { eq, gte, sql } from "drizzle-orm";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [streakRow, events, xpByType] = await Promise.all([
    db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, user.id))
      .limit(1)
      .then((r) => r[0] ?? null),

    db
      .select({
        date: sql<string>`to_char(${userXpEvents.createdAt}, 'YYYY-MM-DD')`,
        points: userXpEvents.points,
        eventType: userXpEvents.eventType,
      })
      .from(userXpEvents)
      .where(
        eq(userXpEvents.userId, user.id),
      )
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
  ]);

  const totalXp = events.reduce((sum, e) => sum + (e.points ?? 0), 0);

  const activityMap: Record<string, number> = {};
  for (const e of events) {
    if (e.date) {
      activityMap[e.date] = (activityMap[e.date] ?? 0) + (e.points ?? 0);
    }
  }

  const recentActivity = Object.entries(activityMap)
    .filter(([date]) => date >= ninetyDaysAgo.toISOString().split("T")[0])
    .map(([date, points]) => ({ date, points }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    totalXp,
    currentStreak: streakRow?.currentStreak ?? 0,
    longestStreak: streakRow?.longestStreak ?? 0,
    lastActiveDate: streakRow?.lastActiveDate ?? null,
    xpByType: xpByType.map((r) => ({ eventType: r.eventType, totalPoints: r.totalPoints, count: r.count })),
    recentActivity,
  });
}
