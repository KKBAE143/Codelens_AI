import { db } from "@workspace/db";
import { userXpEvents, userStreaks } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export const XP_AMOUNTS = {
  module_read: 10,
  quiz_pass: 25,
  flashcard_session: 15,
  course_complete: 100,
} as const;

export type XpEventType = keyof typeof XP_AMOUNTS;

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

export async function awardXp(
  userId: string,
  eventType: XpEventType,
  courseId?: string,
): Promise<{ points: number; newStreak: number }> {
  const points = XP_AMOUNTS[eventType];

  await db.insert(userXpEvents).values({
    userId,
    courseId: courseId ?? null,
    eventType,
    points,
  });

  const today = getTodayDate();
  const yesterday = getYesterdayDate();

  const [existing] = await db
    .select()
    .from(userStreaks)
    .where(eq(userStreaks.userId, userId))
    .limit(1);

  if (existing) {
    if (existing.lastActiveDate === today) {
      return { points, newStreak: existing.currentStreak };
    }

    const newStreak =
      existing.lastActiveDate === yesterday
        ? (existing.currentStreak ?? 0) + 1
        : 1;
    const longestStreak = Math.max(newStreak, existing.longestStreak ?? 0);

    await db
      .update(userStreaks)
      .set({ currentStreak: newStreak, longestStreak, lastActiveDate: today, updatedAt: new Date() })
      .where(eq(userStreaks.userId, userId));

    return { points, newStreak };
  }

  await db.insert(userStreaks).values({
    userId,
    currentStreak: 1,
    longestStreak: 1,
    lastActiveDate: today,
  });

  return { points, newStreak: 1 };
}
