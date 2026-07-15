import type { NextApiResponse } from "next";
import { detectCountryFromRequest, getFounderCohort, getPublicPricing } from "@/backend/billing/pricing";
import { getActiveSubscription, getSubscriptionSummary } from "@/backend/billing/subscription";
import { prisma } from "@/database/prisma/client";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";

type BillingEventRow = {
  event_name: string;
  processing_status: string;
  resource_id: string | null;
  error_message: string | null;
  created_at: Date;
  processed_at: Date | null;
};

function maskIdentifier(value?: string | null) {
  if (!value) return null;
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const country = detectCountryFromRequest(req);
    const [user, subscriptionSummary, activeSubscription, pricing, cohort, events] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.auth.id },
        select: { id: true, email: true, planType: true, createdAt: true }
      }),
      getSubscriptionSummary(req.auth.id),
      getActiveSubscription(req.auth.id),
      getPublicPricing(country),
      getFounderCohort(),
      prisma.$queryRaw<BillingEventRow[]>`
        select
          event_name,
          processing_status,
          resource_id,
          error_message,
          created_at,
          processed_at
        from public.webhook_logs
        where
          payload #>> '{meta,custom_data,user_id}' = ${req.auth.id}
          or payload #>> '{data,attributes,custom_data,user_id}' = ${req.auth.id}
        order by created_at desc
        limit 10
      `
    ]);

    return res.status(200).json({
      currentUser: user
        ? {
            id: user.id,
            email: user.email,
            planType: user.planType,
            createdAt: user.createdAt.toISOString()
          }
        : {
            id: req.auth.id,
            email: req.auth.email,
            planType: "UNKNOWN",
            createdAt: null
          },
      currentPlan: subscriptionSummary.plan,
      subscriptionStatus: subscriptionSummary.status,
      country,
      currentVariant: {
        planSlug: activeSubscription?.planSlug ?? subscriptionSummary.plan.slug,
        lemonVariantId: maskIdentifier(activeSubscription?.lemonVariantId)
      },
      renewalDate: subscriptionSummary.renewalDate,
      webhookStatus: events[0]?.processing_status ?? "No events",
      remainingFounderSlots: cohort.remainingSlots,
      pricingPreview: pricing.activePlan,
      recentBillingEvents: events.map((event) => ({
        eventName: event.event_name,
        status: event.processing_status,
        resourceId: maskIdentifier(event.resource_id),
        errorMessage: event.error_message,
        createdAt: event.created_at.toISOString(),
        processedAt: event.processed_at?.toISOString() ?? null
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load billing debug data.";
    const status = message.includes("Missing Bearer token") || message.includes("Invalid JWT") ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}

export default withApiAuth(handler);
