import type { NextApiResponse } from "next";
import { trackUserEvent } from "@/backend/analytics/analytics-service";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";

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

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body as Body;
    const event = typeof body?.event === "string" ? body.event.trim() : "";

    if (!event) {
      return res.status(400).json({ error: "Event name is required." });
    }

    await trackUserEvent({
      userId: req.auth.id,
      email: req.auth.email,
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

export default withApiAuth(handler);
