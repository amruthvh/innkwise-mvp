import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { createAuthToken } from "@/lib/auth";
import { createPasswordHash } from "@/lib/auth-secrets";
import {
  createSignupLocalUser,
  findLocalUserByEmail,
  setLocalUserPassword
} from "@/lib/local-auth-db";
import { resolveIdentifier } from "@/lib/auth-identifiers";

type Body = {
  identifier?: string;
  email?: string;
  phone?: string;
  password?: string;
  accessMode?: "signup" | "signin";
};

function isReadonlyFilesystemError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("read-only file system") || error.message.includes("EROFS"))
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body as Body;
  const rawIdentifier =
    typeof body?.identifier === "string"
      ? body.identifier
      : typeof body?.email === "string"
        ? body.email
        : typeof body?.phone === "string"
          ? body.phone
          : "";
  const resolved = resolveIdentifier(rawIdentifier);
  const password = typeof body?.password === "string" ? body.password : "";
  const accessMode = body?.accessMode === "signup" ? "signup" : "signin";

  if (!resolved) {
    return res.status(400).json({
      error: "Please enter a valid email address or phone number."
    });
  }

  if (password.trim().length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  try {
    const passwordHash = createPasswordHash(password);
    let user: { id: string; email: string; planType: string; passwordHash?: string | null } | null = null;
    let isNewUser = false;

    try {
      const existingUser = await prisma.user.findUnique({
        where: { email: resolved.userEmail }
      });

      if (accessMode === "signup") {
        if (existingUser) {
          return res.status(400).json({ error: "Account already exists. Please sign in." });
        }

        const createdUser = await prisma.user.create({
          data: {
            email: resolved.userEmail,
            passwordHash
          }
        });

        user = createdUser;
        isNewUser = true;
      } else {
        if (!existingUser) {
          return res.status(404).json({ error: "No account found. Please sign up first." });
        }

        if (!existingUser.passwordHash) {
          return res.status(400).json({ error: "Password is not set for this account yet. Please reset your password." });
        }

        if (existingUser.passwordHash !== passwordHash) {
          return res.status(401).json({ error: "Incorrect password." });
        }

        user = existingUser;
      }
    } catch (dbError) {
      if (accessMode === "signup") {
        try {
          const createdLocalUser = await createSignupLocalUser(resolved.userEmail, passwordHash);
          if (!createdLocalUser) {
            return res.status(400).json({ error: "Account already exists. Please sign in." });
          }

          user = createdLocalUser;
          isNewUser = true;
        } catch (localAuthError) {
          if (isReadonlyFilesystemError(localAuthError) || isReadonlyFilesystemError(dbError)) {
            return res.status(503).json({
              error:
                "Password sign up is unavailable in this deployment right now. Please continue with Google."
            });
          }

          throw localAuthError;
        }
      } else {
        try {
          const localUser = await findLocalUserByEmail(resolved.userEmail);
          if (!localUser) {
            return res.status(404).json({ error: "No account found. Please sign up first." });
          }

          if (!localUser.passwordHash) {
            await setLocalUserPassword(resolved.userEmail, passwordHash);
            return res.status(400).json({ error: "Password was not set for this account. Please try signing in again now." });
          }

          if (localUser.passwordHash !== passwordHash) {
            return res.status(401).json({ error: "Incorrect password." });
          }

          user = localUser;
        } catch (localAuthError) {
          if (isReadonlyFilesystemError(localAuthError) || isReadonlyFilesystemError(dbError)) {
            return res.status(503).json({
              error:
                "Password sign in is unavailable in this deployment right now. Please continue with Google."
            });
          }

          throw localAuthError;
        }
      }
    }

    if (!user) {
      return res.status(500).json({ error: "Unable to continue right now." });
    }

    const token = createAuthToken({
      id: user.id,
      email: user.email
    });

    return res.status(200).json({
      token,
      isNewUser,
      user: {
        id: user.id,
        email: user.email,
        planType: user.planType,
        contactLabel: resolved.contactLabel
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(500).json({ error: message });
  }
}
