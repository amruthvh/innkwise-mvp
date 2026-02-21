import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { requireUserIdFromRequest } from "@/lib/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const userId = requireUserIdFromRequest(req);

    const scripts = await prisma.script.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    return res.status(200).json({ scripts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(401).json({ error: message });
  }
}
