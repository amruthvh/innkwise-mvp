import type { NextApiRequest, NextApiResponse } from "next";
import { buffer } from "micro";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe, STRIPE_PRICE_TO_PLAN } from "@/lib/stripe";

export const config = {
  api: {
    bodyParser: false
  }
};

async function resolvePlanFromSession(session: Stripe.Checkout.Session): Promise<"CREATOR" | "PRO" | null> {
  if (!session.id) return null;

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
  const priceId = lineItems.data[0]?.price?.id;

  if (!priceId) return null;
  return STRIPE_PRICE_TO_PLAN[priceId] ?? null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return res.status(400).json({ error: "Missing Stripe signature or webhook secret." });
  }

  try {
    const rawBody = await buffer(req);

    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string | null;
      const planType = await resolvePlanFromSession(session);

      if (customerId && planType) {
        await prisma.user.updateMany({
          where: { stripeCustomerId: customerId },
          data: { planType }
        });
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook error";
    return res.status(400).json({ error: message });
  }
}
