import type { NextApiResponse } from "next";
import { cancelCurrentSubscription, getSubscriptionSummary } from "@/backend/billing/subscription";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userId = req.auth.id;
    await cancelCurrentSubscription(userId);
    const subscription = await getSubscriptionSummary(userId);

    return res.status(200).json({
      subscription,
      message: "Your plan is cancelled. You will keep full access until the end of your billing period."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to cancel subscription.";
    return res.status(400).json({ error: message });
  }
}

export default withApiAuth(handler);
