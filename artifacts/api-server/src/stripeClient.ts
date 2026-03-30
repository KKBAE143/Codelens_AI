import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

if (!stripeSecretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY must be set. Get your API key from https://dashboard.stripe.com/apikeys",
  );
}

export async function getUncachableStripeClient() {
  return new Stripe(stripeSecretKey, {
    apiVersion: "2025-11-17.clover",
  });
}

export async function getStripePublishableKey() {
  if (!stripePublishableKey) {
    throw new Error("STRIPE_PUBLISHABLE_KEY must be set");
  }
  return stripePublishableKey;
}

export async function getStripeSecretKey() {
  return stripeSecretKey;
}
