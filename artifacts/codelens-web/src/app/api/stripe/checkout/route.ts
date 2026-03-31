export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUncachableStripeClient } from "@/lib/stripeClient";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const PLAN_PRICE_MAP: Record<string, string> = {
  pro: process.env.STRIPE_PRO_PRICE_ID || "",
  team: process.env.STRIPE_TEAM_PRICE_ID || "",
};

export async function POST(request: Request) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { plan } = body;

  if (!plan || !["pro", "team"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan. Must be 'pro' or 'team'" }, { status: 400 });
  }

  try {
    const stripe = await getUncachableStripeClient();

    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let customerId = dbUser.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { userId: user.id, username: user.username },
      });
      await db.update(users).set({ stripeCustomerId: customer.id, updatedAt: new Date() }).where(eq(users.id, user.id));
      customerId = customer.id;
    }

    let priceId = PLAN_PRICE_MAP[plan];
    if (!priceId) {
      try {
        const result = await db.execute(
          sql`SELECT pr.id as price_id FROM stripe.products p JOIN stripe.prices pr ON pr.product = p.id WHERE p.active = true AND p.metadata->>'plan' = ${plan} AND pr.active = true AND pr.recurring IS NOT NULL ORDER BY pr.unit_amount ASC LIMIT 1`
        );
        if (result.rows.length > 0) {
          priceId = result.rows[0].price_id as string;
        }
      } catch {
        // stripe schema may not exist yet
      }
    }

    if (!priceId) {
      return NextResponse.json({ error: `No price configured for plan: ${plan}. Please run the seed-products script first.` }, { status: 400 });
    }

    const origin = request.headers.get("origin") || request.headers.get("referer")?.replace(/\/[^/]*$/, "") || `https://${request.headers.get("host")}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      metadata: { userId: user.id, plan },
      subscription_data: {
        metadata: { userId: user.id, plan },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("Checkout error:", error.message);
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }
}
