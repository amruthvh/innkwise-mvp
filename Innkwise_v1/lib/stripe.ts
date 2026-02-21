import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-02-24.acacia"
});

export const STRIPE_PRICE_TO_PLAN: Record<string, "CREATOR" | "PRO"> = {
  [process.env.STRIPE_CREATOR_PRICE_ID || ""]: "CREATOR",
  [process.env.STRIPE_PRO_PRICE_ID || ""]: "PRO"
};
