import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY must be set. Get your API key from https://dashboard.stripe.com/apikeys",
  );
}

const SECRET_KEY: string = stripeSecretKey;

export async function getUncachableStripeClient() {
  return new Stripe(SECRET_KEY, {
    apiVersion: "2025-11-17.clover",
  });
}
