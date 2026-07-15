import type { NextApiResponse } from "next";
import { prisma } from "@/database/prisma/client";
import { findLocalUserById } from "@/database/local/local-auth-repository";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.auth.id },
        select: {
          id: true,
          email: true,
          planType: true,
          createdAt: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      return res.status(200).json({ user });
    } catch {
      const user = await findLocalUserById(req.auth.id);

      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      return res.status(200).json({ user });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(401).json({ error: message });
  }
}

export default withApiAuth(handler);
