import type { NextApiRequest, NextApiResponse } from "next";
import { buffer } from "micro";
import { processLemonWebhook } from "@/backend/billing/webhook";
import { verifyLemonSignature } from "@/backend/billing/lemonsqueezy";

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const rawBody = await buffer(req);
    const signature = req.headers["x-signature"];

    if (!verifyLemonSignature(rawBody, signature)) {
      return res.status(401).json({ error: "Invalid Lemon Squeezy signature." });
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const result = await processLemonWebhook(payload);
    return res.status(200).json({ received: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    return res.status(400).json({ error: message });
  }
}
