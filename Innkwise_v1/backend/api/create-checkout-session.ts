import type { NextApiResponse } from "next";
import { stripe } from "@/backend/billing/stripe-client";
import { prisma } from "@/database/prisma/client";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";

type Body = {
  plan: "CREATOR" | "PRO";
};

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as Body;
  if (body?.plan !== "CREATOR" && body?.plan !== "PRO") {
    return res.status(400).json({ error: "Plan must be CREATOR or PRO." });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.auth.id } });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const priceId = body.plan === "CREATOR" ? process.env.STRIPE_CREATOR_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID;

    if (!priceId || !process.env.NEXT_PUBLIC_APP_URL) {
      return res.status(500).json({ error: "Stripe pricing or app URL not configured." });
    }

    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: user.id }
      });
      customerId = customer.id;

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId }
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?billing=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?billing=cancel`
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: message });
  }
}

export default withApiAuth(handler);
