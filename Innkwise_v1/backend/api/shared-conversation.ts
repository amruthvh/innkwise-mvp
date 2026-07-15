import type { NextApiRequest, NextApiResponse } from "next";
import { getSharedConversation } from "@/backend/creator-os/crud-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) return res.status(400).json({ error: "Share token is required." });

  const conversation = await getSharedConversation(token);
  if (!conversation) return res.status(404).json({ error: "Shared conversation not found." });
  return res.status(200).json({ conversation });
}
