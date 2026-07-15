import type { NextApiResponse } from "next";
import { prisma } from "@/database/prisma/client";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const scripts = await prisma.script.findMany({
      where: { userId: req.auth.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    return res.status(200).json({ scripts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(401).json({ error: message });
  }
}

export default withApiAuth(handler);
