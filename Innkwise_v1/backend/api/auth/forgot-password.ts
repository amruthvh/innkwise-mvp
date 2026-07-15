import type { NextApiRequest, NextApiResponse } from "next";
import { setLocalResetToken, findLocalUserByEmail } from "@/database/local/local-auth-repository";
import { createResetToken } from "@/backend/auth/secrets";
import { resolveIdentifier } from "@/backend/auth/identifiers";
import { sendResetLink } from "@/backend/auth/notifications";

type Body = {
  identifier?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as Body;
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
  const resolved = resolveIdentifier(identifier);

  if (!resolved) {
    return res.status(400).json({ error: "Please enter a valid email address or phone number." });
  }

  try {
    const user = await findLocalUserByEmail(resolved.userEmail);
    if (!user) {
      return res.status(404).json({ error: "No account found for that email or number." });
    }

    const token = createResetToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
    await setLocalResetToken(resolved.userEmail, token, expiresAt);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resetLink = `${baseUrl}/auth/reset?token=${token}`;
    const delivery = await sendResetLink({ identifier, resetLink });

    return res.status(200).json({
      message:
        delivery.delivered
          ? `Reset link sent successfully via ${delivery.channel}.`
          : "Reset link created. Configure your email or SMS provider to send it automatically.",
      delivery,
      resetLink: delivery.delivered ? undefined : resetLink
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: message });
  }
}
