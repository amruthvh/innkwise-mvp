import type { NextApiRequest, NextApiResponse } from "next";
import { createPasswordHash } from "@/lib/auth-secrets";
import { findLocalUserByResetToken, updateLocalUserPassword } from "@/lib/local-auth-db";

type Body = {
  token?: string;
  password?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as Body;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!token) {
    return res.status(400).json({ error: "Reset token is required." });
  }

  if (password.trim().length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const user = await findLocalUserByResetToken(token);
    if (!user) {
      return res.status(400).json({ error: "This reset link is invalid or has expired." });
    }

    await updateLocalUserPassword(token, createPasswordHash(password));
    return res.status(200).json({ message: "Password reset successfully." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: message });
  }
}
