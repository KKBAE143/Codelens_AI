export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  try {
    const sessionUser = await getUser();
    if (!sessionUser) {
      return NextResponse.json({ user: null, authenticated: false });
    }

    const [dbUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, sessionUser.id))
      .limit(1);

    if (!dbUser) {
      return NextResponse.json({ user: null, authenticated: false });
    }

    const planChanged = sessionUser.plan !== dbUser.plan;
    const generationsChanged =
      sessionUser.monthlyGenerationsUsed !== dbUser.monthlyGenerationsUsed;

    if (planChanged || generationsChanged) {
      await db.execute(sql`
        UPDATE sessions
        SET sess = jsonb_set(
          jsonb_set(sess, '{user,plan}', to_jsonb(${dbUser.plan}::text)),
          '{user,monthlyGenerationsUsed}', to_jsonb(${dbUser.monthlyGenerationsUsed}::int)
        )
        WHERE sess->'user'->>'id' = ${sessionUser.id}
          AND expire > NOW()
      `);
    }

    const freshUser = {
      id: dbUser.id,
      username: dbUser.username,
      displayName: dbUser.displayName,
      email: dbUser.email,
      avatarUrl: dbUser.avatarUrl,
      plan: dbUser.plan as "free" | "pro" | "team",
      githubUsername: dbUser.githubUsername,
      githubConnectedAt: dbUser.githubConnectedAt,
      monthlyGenerationsUsed: dbUser.monthlyGenerationsUsed,
    };

    return NextResponse.json({ user: freshUser, authenticated: true });
  } catch {
    return NextResponse.json({ user: null, authenticated: false });
  }
}
