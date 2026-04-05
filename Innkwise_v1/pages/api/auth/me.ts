import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireAuthPayloadFromRequest } from "@/lib/auth";
import { findLocalUserById } from "@/lib/local-auth-db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = requireAuthPayloadFromRequest(req);

    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
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
      const user = await findLocalUserById(payload.sub);

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
