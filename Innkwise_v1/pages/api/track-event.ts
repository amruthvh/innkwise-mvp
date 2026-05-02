import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuthPayloadFromRequest } from "@/lib/auth";
import { trackUserEvent } from "@/lib/analytics";

type Body = {
  event?: string;
  path?: string;
  metadata?: Record<string, unknown>;
};

function cleanMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = requireAuthPayloadFromRequest(req);
    const body = req.body as Body;
    const event = typeof body?.event === "string" ? body.event.trim() : "";

    if (!event) {
      return res.status(400).json({ error: "Event name is required." });
    }

    await trackUserEvent({
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      event,
      path: typeof body?.path === "string" ? body.path : null,
      metadata: cleanMetadata(body?.metadata)
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(401).json({ error: message });
  }
}
