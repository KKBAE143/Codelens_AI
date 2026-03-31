import Stripe from "stripe";

let _stripe: Stripe | null = null;

export async function getUncachableStripeClient() {
  if (!_stripe) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY must be set. Get your API key from https://dashboard.stripe.com/apikeys",
      );
    }
    _stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-11-17.clover",
    });
  }
  return _stripe;
}

export async function getStripePublishableKey() {
  const key = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    throw new Error("STRIPE_PUBLISHABLE_KEY must be set");
  }
  return key;
}

export async function getStripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY must be set");
  }
  return key;
}
