import { getUncachableStripeClient } from "./stripeClient";

export class WebhookHandlers {
  static async processWebhook(
    payload: Buffer,
    signature: string,
  ): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
          "Received type: " +
          typeof payload +
          ". " +
          "This usually means express.json() parsed the body before reaching this handler. " +
          "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
    }

    const stripe = await getUncachableStripeClient();
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        console.log(
          `Checkout completed for customer ${session.customer}, subscription ${session.subscription}`,
        );
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        console.log(
          `Subscription ${subscription.id} updated, status: ${subscription.status}`,
        );
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        console.log(`Subscription ${subscription.id} deleted`);
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
  }
}
