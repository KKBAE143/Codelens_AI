export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireOrgMembership } from "@/lib/org-helpers";
import { db } from "@workspace/db";
import { userXpEvents, userStreaks, organizationMembers, users } from "@workspace/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { getLevelForXp } from "@/lib/xp-constants";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { slug } = await params;
  const result = await requireOrgMembership(slug, user.id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const members = await db
    .select({
      userId: organizationMembers.userId,
      displayName: users.displayName,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(
      and(
        eq(organizationMembers.organizationId, result.org.id),
        eq(organizationMembers.status, "active"),
      ),
    );

  const leaderboard = await Promise.all(
    members.map(async (m) => {
      const [weeklyXp] = await db
        .select({ total: sql<number>`COALESCE(sum(${userXpEvents.points}), 0)::int` })
        .from(userXpEvents)
        .where(
          and(
            eq(userXpEvents.userId, m.userId),
            gte(userXpEvents.createdAt, oneWeekAgo),
          ),
        );

      const [totalXpRow] = await db
        .select({ total: sql<number>`COALESCE(sum(${userXpEvents.points}), 0)::int` })
        .from(userXpEvents)
        .where(eq(userXpEvents.userId, m.userId));

      const [streakRow] = await db
        .select({ currentStreak: userStreaks.currentStreak })
        .from(userStreaks)
        .where(eq(userStreaks.userId, m.userId))
        .limit(1);

      const totalXp = totalXpRow?.total ?? 0;
      const level = getLevelForXp(totalXp);

      return {
        userId: m.userId,
        displayName: m.displayName,
        username: m.username,
        avatarUrl: m.avatarUrl,
        weeklyXp: weeklyXp?.total ?? 0,
        totalXp,
        level: level.level,
        levelName: level.name,
        currentStreak: streakRow?.currentStreak ?? 0,
      };
    }),
  );

  leaderboard.sort((a, b) => b.weeklyXp - a.weeklyXp);

  return NextResponse.json({ leaderboard });
}
