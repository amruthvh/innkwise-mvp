import type { NextApiRequest } from "next";
import jwt, { type JwtPayload } from "jsonwebtoken";

export type AuthPayload = JwtPayload & {
  sub: string;
  email?: string;
};

export function requireUserIdFromRequest(req: NextApiRequest): string {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing Bearer token.");
  }

  const token = authHeader.slice("Bearer ".length);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT secret is not configured.");
  }

  const payload = jwt.verify(token, secret) as AuthPayload;

  if (!payload?.sub || typeof payload.sub !== "string") {
    throw new Error("Invalid JWT subject.");
  }

  return payload.sub;
}
