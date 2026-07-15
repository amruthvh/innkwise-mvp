import { createHash } from "crypto";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { createAuthToken } from "@/backend/auth/jwt";
import { trackUserEvent } from "@/backend/analytics/analytics-service";
import { findOrCreateLocalUser } from "@/database/local/local-auth-repository";
import { prisma } from "@/database/prisma/client";

type AppAuthUser = {
  id: string;
  email: string;
  planType: string;
};

function buildFallbackAppAuthUser(email: string): AppAuthUser {
  const hash = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24);
  return {
    id: `fallback-${hash}`,
    email,
    planType: "FREE"
  };
}

async function findOrCreateAppAuthUser(email: string): Promise<AppAuthUser> {
  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        planType: true
      }
    });

    if (existingUser) {
      return existingUser;
    }

    return await prisma.user.create({
      data: { email },
      select: {
        id: true,
        email: true,
        planType: true
      }
    });
  } catch {
    try {
      const { user } = await findOrCreateLocalUser(email);
      return user;
    } catch {
      // Vercel production is not a reliable writable filesystem, so fall back
      // to a deterministic in-memory app user instead of failing auth.
      return buildFallbackAppAuthUser(email);
    }
  }
}

async function trackGoogleSignIn(user: AppAuthUser) {
  try {
    await trackUserEvent({
      userId: user.id,
      email: user.email,
      event: "auth_google_sign_in"
    });
  } catch (error) {
    console.error("Failed to track Google sign in event.", error);
  }
}

const providers = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  );
}

export const authOptions: NextAuthOptions = {
  providers,
  secret: process.env.NEXTAUTH_SECRET ?? process.env.JWT_SECRET,
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/auth",
    error: "/auth"
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) {
        return false;
      }

      const appUser = await findOrCreateAppAuthUser(user.email);
      await trackGoogleSignIn(appUser);
      return true;
    },
    async jwt({ token, user }) {
      const email = user?.email ?? (typeof token.email === "string" ? token.email : "");

      if (!email) {
        return token;
      }

      const shouldSyncToken =
        typeof token.appAuthToken !== "string" ||
        !token.appAuthToken ||
        token.appUserEmail !== email;

      if (shouldSyncToken) {
        const appUser = await findOrCreateAppAuthUser(email);

        token.appUserId = appUser.id;
        token.appUserEmail = appUser.email;
        token.appAuthToken = createAuthToken({
          id: appUser.id,
          email: appUser.email
        });
      }

      return token;
    },
    async session({ session, token }) {
      session.appAuthToken = typeof token.appAuthToken === "string" ? token.appAuthToken : "";

      if (session.user) {
        session.user.id = typeof token.appUserId === "string" ? token.appUserId : "";
        session.user.email =
          typeof token.appUserEmail === "string"
            ? token.appUserEmail
            : session.user.email ?? null;
      }

      return session;
    }
  }
};
