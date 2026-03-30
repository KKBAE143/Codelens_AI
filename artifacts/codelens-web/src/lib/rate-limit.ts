import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const PLAN_LIMITS: Record<string, number> = {
  free: 5,
  pro: Infinity,
  team: Infinity,
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { allowed: false, remaining: 0, resetAt: new Date() };
  }

  const limit = PLAN_LIMITS[user.plan] ?? 5;
  const now = new Date();
  const resetAt = user.monthlyGenerationsResetAt ?? getNextMonthReset();

  if (resetAt <= now) {
    const newResetAt = getNextMonthReset();
    await db
      .update(users)
      .set({
        monthlyGenerationsUsed: 0,
        monthlyGenerationsResetAt: newResetAt,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    return { allowed: true, remaining: limit, resetAt: newResetAt };
  }

  const used = user.monthlyGenerationsUsed;
  const remaining = Math.max(0, limit - used);

  return {
    allowed: used < limit,
    remaining,
    resetAt,
  };
}

export async function checkAndIncrementUsage(userId: string): Promise<RateLimitResult> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { allowed: false, remaining: 0, resetAt: new Date() };
  }

  const limit = PLAN_LIMITS[user.plan] ?? 5;
  const now = new Date();
  const resetAt = user.monthlyGenerationsResetAt ?? getNextMonthReset();

  if (resetAt <= now) {
    const newResetAt = getNextMonthReset();
    await db
      .update(users)
      .set({
        monthlyGenerationsUsed: 1,
        monthlyGenerationsResetAt: newResetAt,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    return { allowed: true, remaining: limit - 1, resetAt: newResetAt };
  }

  if (user.monthlyGenerationsUsed >= limit) {
    return { allowed: false, remaining: 0, resetAt };
  }

  await db
    .update(users)
    .set({
      monthlyGenerationsUsed: user.monthlyGenerationsUsed + 1,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  return {
    allowed: true,
    remaining: Math.max(0, limit - user.monthlyGenerationsUsed - 1),
    resetAt,
  };
}

function getNextMonthReset(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}
