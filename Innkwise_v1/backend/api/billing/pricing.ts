import type { NextApiRequest, NextApiResponse } from "next";
import { detectCountryFromRequest, getPublicPricing } from "@/backend/billing/pricing";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const country = detectCountryFromRequest(req);
    const pricing = await getPublicPricing(country);
    return res.status(200).json({ pricing });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load pricing.";
    return res.status(500).json({ error: message });
  }
}
