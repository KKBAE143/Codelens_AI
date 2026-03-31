import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq, sql, and, lt } from "drizzle-orm";

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
  const currentResetAt = user.monthlyGenerationsResetAt ?? getNextMonthReset();
  const needsReset = currentResetAt <= now;

  if (needsReset) {
    const newResetAt = getNextMonthReset();
    const resetResult = await db
      .update(users)
      .set({
        monthlyGenerationsUsed: 1,
        monthlyGenerationsResetAt: newResetAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(users.id, userId),
          sql`(${users.monthlyGenerationsResetAt} IS NULL OR ${users.monthlyGenerationsResetAt} <= ${now})`
        )
      )
      .returning({ used: users.monthlyGenerationsUsed });

    if (resetResult.length) {
      return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: newResetAt };
    }
    const [freshUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!freshUser) return { allowed: false, remaining: 0, resetAt: new Date() };
    const freshLimit = PLAN_LIMITS[freshUser.plan] ?? 5;
    const freshResetAt = freshUser.monthlyGenerationsResetAt ?? getNextMonthReset();
    if (freshUser.monthlyGenerationsUsed >= freshLimit) {
      return { allowed: false, remaining: 0, resetAt: freshResetAt };
    }
  }

  if (!needsReset && user.monthlyGenerationsUsed >= limit) {
    return { allowed: false, remaining: 0, resetAt: currentResetAt };
  }

  const effectiveLimit = limit === Infinity ? 2147483647 : limit;
  const updated = await db
    .update(users)
    .set({
      monthlyGenerationsUsed: sql`${users.monthlyGenerationsUsed} + 1`,
      updatedAt: now,
    })
    .where(
      and(
        eq(users.id, userId),
        lt(users.monthlyGenerationsUsed, effectiveLimit)
      )
    )
    .returning({ used: users.monthlyGenerationsUsed, resetAt: users.monthlyGenerationsResetAt });

  if (!updated.length) {
    return { allowed: false, remaining: 0, resetAt: currentResetAt };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - updated[0].used),
    resetAt: updated[0].resetAt ?? currentResetAt,
  };
}

function getNextMonthReset(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}
