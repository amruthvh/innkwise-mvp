import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { createAuthToken } from "@/lib/auth";
import { findOrCreateLocalUser } from "@/lib/local-auth-db";
import { prisma } from "@/lib/prisma";

type AppAuthUser = {
  id: string;
  email: string;
  planType: string;
};

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
    const { user } = await findOrCreateLocalUser(email);
    return user;
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

      await findOrCreateAppAuthUser(user.email);
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
