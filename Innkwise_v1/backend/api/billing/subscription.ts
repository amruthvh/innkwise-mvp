import type { NextApiResponse } from "next";
import { getSubscriptionSummary } from "@/backend/billing/subscription";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const subscription = await getSubscriptionSummary(req.auth.id);
    return res.status(200).json({ subscription });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load subscription.";
    return res.status(500).json({ error: message });
  }
}

export default withApiAuth(handler);
