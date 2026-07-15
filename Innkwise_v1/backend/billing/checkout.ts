import type { NextApiRequest } from "next";
import { prisma } from "@/database/prisma/client";
import { createLemonCheckout } from "@/backend/billing/lemonsqueezy";
import {
  detectBillingRegion,
  detectCountryFromRequest,
  selectCheckoutPlan
} from "@/backend/billing/pricing";
import { ensureProfileForAppUser } from "@/backend/creator-os/crud-service";
import { getAuthenticatedUser } from "@/lib/auth/auth";

type DbUser = {
  id: string;
  email: string;
};

function getAppUrl(req: NextApiRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;

  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  return `${Array.isArray(proto) ? proto[0] : proto}://${Array.isArray(host) ? host[0] : host}`;
}

async function getAppUser(id: string, email?: string | null): Promise<DbUser> {
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true }
  });

  if (existing) return existing;
  if (!email) throw new Error("Authenticated user email is missing.");

  return prisma.user.create({
    data: { id, email },
    select: { id: true, email: true }
  });
}

export async function createCheckoutForRequest(req: NextApiRequest) {
  const authUser = await getAuthenticatedUser(req);
  const user = await getAppUser(authUser.id, authUser.email);
  await ensureProfileForAppUser({ id: user.id, email: user.email });

  const country = detectCountryFromRequest(req);
  const region = detectBillingRegion(country);
  const plan = await selectCheckoutPlan(region);
  const appUrl = getAppUrl(req);

  return createLemonCheckout({
    plan,
    user,
    country,
    successUrl: `${appUrl}/dashboard?billing=success`,
    cancelUrl: `${appUrl}/pricing?billing=cancel`
  });
}
