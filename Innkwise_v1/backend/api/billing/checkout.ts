import type { NextApiRequest, NextApiResponse } from "next";
import { createCheckoutForRequest } from "@/backend/billing/checkout";
import { isApiError } from "@/lib/auth/errors";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const checkout = await createCheckoutForRequest(req);
    return res.status(200).json(checkout);
  } catch (error) {
    if (isApiError(error)) {
      return res.status(error.statusCode).json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    const message = error instanceof Error ? error.message : "Unable to create checkout.";
    const status = message.includes("Missing Bearer token") || message.includes("Invalid JWT") ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
