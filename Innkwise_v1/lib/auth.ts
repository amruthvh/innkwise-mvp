import type { NextApiRequest } from "next";
import jwt, { type JwtPayload } from "jsonwebtoken";

export type AuthPayload = JwtPayload & {
  sub: string;
  email?: string;
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("JWT secret is not configured.");
  }

  return secret;
}

function getBearerToken(req: NextApiRequest): string {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing Bearer token.");
  }

  return authHeader.slice("Bearer ".length);
}

export function createAuthToken(payload: { id: string; email?: string }): string {
  return jwt.sign(
    {
      sub: payload.id,
      email: payload.email
    },
    getJwtSecret(),
    { expiresIn: "30d" }
  );
}

export function requireAuthPayloadFromRequest(req: NextApiRequest): AuthPayload {
  const payload = jwt.verify(getBearerToken(req), getJwtSecret()) as AuthPayload;

  if (!payload?.sub || typeof payload.sub !== "string") {
    throw new Error("Invalid JWT subject.");
  }

  return payload;
}

export function requireUserIdFromRequest(req: NextApiRequest): string {
  return requireAuthPayloadFromRequest(req).sub;
}
