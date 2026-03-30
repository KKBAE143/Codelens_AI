export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!dbUser.stripeSubscriptionId) {
      return NextResponse.json({ subscription: null, plan: dbUser.plan });
    }

    try {
      const result = await db.execute(
        sql`SELECT * FROM stripe.subscriptions WHERE id = ${dbUser.stripeSubscriptionId}`
      );
      const subscription = result.rows[0] || null;
      return NextResponse.json({ subscription, plan: dbUser.plan });
    } catch {
      return NextResponse.json({ subscription: null, plan: dbUser.plan });
    }
  } catch (error: any) {
    console.error("Subscription fetch error:", error.message);
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 });
  }
}
