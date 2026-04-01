export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getUncachableStripeClient } from "@/lib/stripeClient";
import { db } from "@workspace/db";
import { users, stripeProcessedEvents } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

async function updateUserAndSession(
  userId: string,
  plan: string,
  userFields: Record<string, unknown>,
) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);

    await tx
      .update(users)
      .set(userFields)
      .where(eq(users.id, userId));

    await tx.execute(sql`
      UPDATE sessions
      SET sess = jsonb_set(sess, '{user,plan}', to_jsonb(${plan}::text))
      WHERE sess->'user'->>'id' = ${userId}
        AND expire > NOW()
    `);
  });
  console.log(`Updated user ${userId} to plan ${plan} (atomic transaction)`);
}

export async function POST(request: Request) {
  try {
    const stripe = await getUncachableStripeClient();
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature" },
        { status: 400 },
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error(
        "STRIPE_WEBHOOK_SECRET is not configured. Webhook events cannot be verified.",
      );
      return NextResponse.json(
        { error: "Webhook not configured" },
        { status: 500 },
      );
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return NextResponse.json(
        { error: "Webhook signature verification failed" },
        { status: 400 },
      );
    }

    const inserted = await db.insert(stripeProcessedEvents).values({
      eventId: event.id,
      eventType: event.type,
    }).onConflictDoNothing().returning({ eventId: stripeProcessedEvents.eventId });

    if (!inserted.length) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan;

        if (userId && plan && ["pro", "team"].includes(plan)) {
          await updateUserAndSession(userId, plan, {
            plan: plan as "pro" | "team",
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            updatedAt: new Date(),
          });
          console.log(`User ${userId} upgraded to ${plan}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;

        if (userId) {
          const status = subscription.status;
          if (status === "active" || status === "trialing") {
            const plan = subscription.metadata?.plan;
            if (plan && ["pro", "team"].includes(plan)) {
              await updateUserAndSession(userId, plan, {
                plan: plan as "pro" | "team",
                stripeSubscriptionId: subscription.id,
                updatedAt: new Date(),
              });
            }
          } else if (
            status === "canceled" ||
            status === "unpaid" ||
            status === "past_due"
          ) {
            await updateUserAndSession(userId, "free", {
              plan: "free",
              stripeSubscriptionId: null,
              updatedAt: new Date(),
            });
            console.log(
              `User ${userId} downgraded to free (subscription ${status})`,
            );
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;

        if (userId) {
          await updateUserAndSession(userId, "free", {
            plan: "free",
            stripeSubscriptionId: null,
            updatedAt: new Date(),
          });
          console.log(
            `User ${userId} subscription deleted, downgraded to free`,
          );
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.error(
          `Payment failed for invoice ${invoice.id}, customer: ${invoice.customer}`,
        );
        break;
      }
    }
    } catch (processingError: any) {
      console.error("Webhook processing failed, removing event marker for retry:", processingError.message);
      await db.delete(stripeProcessedEvents).where(eq(stripeProcessedEvents.eventId, event.id)).catch(() => {});
      return NextResponse.json(
        { error: "Webhook processing error" },
        { status: 500 },
      );
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook error:", error.message);
    return NextResponse.json(
      { error: "Webhook processing error" },
      { status: 500 },
    );
  }
}
