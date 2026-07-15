import type { NextApiRequest } from "next";
import { requireAuthPayloadFromRequest } from "@/backend/auth/jwt";
import { UnauthorizedError } from "@/lib/auth/errors";

export type AuthSource = "supabase" | "app_jwt";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  source: AuthSource;
};

function getBearerToken(req: NextApiRequest): string {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing authentication token.");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new UnauthorizedError("Missing authentication token.");
  return token;
}

function getSupabaseAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  return {
    url: url.replace(/\/$/, ""),
    anonKey
  };
}

async function validateSupabaseSession(token: string): Promise<AuthenticatedUser | null> {
  const config = getSupabaseAuthConfig();
  if (!config) return null;

  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) return null;

  const user = await response.json() as {
    id?: unknown;
    email?: unknown;
  };

  if (typeof user.id !== "string" || !user.id) return null;

  return {
    id: user.id,
    email: typeof user.email === "string" ? user.email : null,
    source: "supabase"
  };
}

export async function getAuthenticatedUser(req: NextApiRequest): Promise<AuthenticatedUser> {
  const token = getBearerToken(req);

  try {
    const supabaseUser = await validateSupabaseSession(token);
    if (supabaseUser) return supabaseUser;
  } catch (error) {
    console.warn("[auth] Supabase session validation failed", {
      method: req.method,
      path: req.url,
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }

  try {
    const payload = requireAuthPayloadFromRequest(req);
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      source: "app_jwt"
    };
  } catch {
    console.warn("[auth] Authentication failed", {
      method: req.method,
      path: req.url
    });
    throw new UnauthorizedError("Invalid or expired authentication token.");
  }
}
