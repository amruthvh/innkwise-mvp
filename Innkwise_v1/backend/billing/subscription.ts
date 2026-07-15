import { prisma } from "@/database/prisma/client";
import { cancelLemonSubscription } from "@/backend/billing/lemonsqueezy";
import { getFeaturesForPlan } from "@/backend/billing/features";
import { getPlanById } from "@/backend/billing/pricing";
import type {
  BillingPlanSlug,
  Subscription,
  SubscriptionStatus,
  SubscriptionSummary
} from "@/shared/types/billing";
import type { JsonObject } from "@/shared/types/creator-os";

type DbRow = Record<string, unknown>;

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : value ? String(value) : null;
}

function mapSubscription(row: DbRow): Subscription {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    planId: row.plan_id ? String(row.plan_id) : null,
    lemonSubscriptionId: String(row.lemon_subscription_id),
    lemonCustomerId: row.lemon_customer_id ? String(row.lemon_customer_id) : null,
    lemonOrderId: row.lemon_order_id ? String(row.lemon_order_id) : null,
    lemonProductId: row.lemon_product_id ? String(row.lemon_product_id) : null,
    lemonVariantId: row.lemon_variant_id ? String(row.lemon_variant_id) : null,
    status: normalizeSubscriptionStatus(row.status),
    statusFormatted: row.status_formatted ? String(row.status_formatted) : null,
    renewsAt: iso(row.renews_at),
    endsAt: iso(row.ends_at),
    trialEndsAt: iso(row.trial_ends_at),
    cancelledAt: iso(row.cancelled_at),
    customerPortalUrl: row.customer_portal_url ? String(row.customer_portal_url) : null,
    updatePaymentMethodUrl: row.update_payment_method_url ? String(row.update_payment_method_url) : null,
    country: row.country ? String(row.country) : null,
    planSlug: row.plan_slug ? String(row.plan_slug) as BillingPlanSlug : null,
    customData: (row.custom_data ?? {}) as JsonObject,
    providerPayload: (row.provider_payload ?? {}) as JsonObject,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function isFutureDate(value?: string | null) {
  if (!value) return false;
  return new Date(value).getTime() > Date.now();
}

function hasCreatorAccess(subscription: Subscription | null) {
  if (!subscription) return false;
  if (["active", "on_trial", "past_due", "paused"].includes(subscription.status)) return true;
  return subscription.status === "cancelled" && isFutureDate(subscription.endsAt ?? subscription.renewsAt);
}

export function normalizeSubscriptionStatus(status: unknown): SubscriptionStatus {
  const normalized = String(status ?? "unknown").toLowerCase();
  if (
    normalized === "active" ||
    normalized === "cancelled" ||
    normalized === "expired" ||
    normalized === "on_trial" ||
    normalized === "past_due" ||
    normalized === "paused" ||
    normalized === "unpaid" ||
    normalized === "pending"
  ) {
    return normalized;
  }
  return "unknown";
}

export async function getActiveSubscription(userId: string): Promise<Subscription | null> {
  const rows = await prisma.$queryRaw<DbRow[]>`
    select *
    from public.subscriptions
    where user_id = ${userId}::uuid
      and (
        status in ('active', 'on_trial', 'past_due', 'paused', 'pending')
        or (status = 'cancelled' and coalesce(ends_at, renews_at) > now())
      )
    order by updated_at desc
    limit 1
  `;

  return rows[0] ? mapSubscription(rows[0]) : null;
}

export async function getSubscriptionSummary(userId: string): Promise<SubscriptionSummary> {
  const subscription = await getActiveSubscription(userId);
  const plan = await getPlanById(subscription?.planId);
  const planSlug = plan?.slug ?? subscription?.planSlug ?? "free";
  const isCreator = hasCreatorAccess(subscription);

  return {
    plan: {
      slug: planSlug,
      displayName: plan?.displayName ?? (isCreator ? "Creator" : "Free"),
      currency: plan?.currency ?? null,
      price: plan?.price ?? 0,
      isFounding: plan?.isFounding ?? false
    },
    status: subscription?.status ?? "free",
    isCreator,
    renewalDate: subscription?.status === "cancelled"
      ? subscription.endsAt ?? subscription.renewsAt
      : subscription?.renewsAt ?? null,
    manageUrl: subscription?.customerPortalUrl ?? null,
    features: getFeaturesForPlan(planSlug)
  };
}

export async function upsertSubscription(input: {
  userId: string;
  planId: string | null;
  lemonSubscriptionId: string;
  lemonCustomerId?: string | null;
  lemonOrderId?: string | null;
  lemonProductId?: string | null;
  lemonVariantId?: string | null;
  status: SubscriptionStatus;
  statusFormatted?: string | null;
  renewsAt?: string | null;
  endsAt?: string | null;
  trialEndsAt?: string | null;
  cancelledAt?: string | null;
  pauseMode?: string | null;
  cardBrand?: string | null;
  cardLastFour?: string | null;
  customerPortalUrl?: string | null;
  updatePaymentMethodUrl?: string | null;
  country?: string | null;
  planSlug?: string | null;
  customData?: JsonObject;
  providerPayload?: JsonObject;
}) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    insert into public.subscriptions (
      user_id,
      plan_id,
      lemon_subscription_id,
      lemon_customer_id,
      lemon_order_id,
      lemon_product_id,
      lemon_variant_id,
      status,
      status_formatted,
      renews_at,
      ends_at,
      trial_ends_at,
      cancelled_at,
      pause_mode,
      card_brand,
      card_last_four,
      customer_portal_url,
      update_payment_method_url,
      country,
      plan_slug,
      custom_data,
      provider_payload
    )
    values (
      ${input.userId}::uuid,
      ${input.planId}::uuid,
      ${input.lemonSubscriptionId},
      ${input.lemonCustomerId ?? null},
      ${input.lemonOrderId ?? null},
      ${input.lemonProductId ?? null},
      ${input.lemonVariantId ?? null},
      ${input.status},
      ${input.statusFormatted ?? null},
      ${input.renewsAt ?? null}::timestamptz,
      ${input.endsAt ?? null}::timestamptz,
      ${input.trialEndsAt ?? null}::timestamptz,
      ${input.cancelledAt ?? null}::timestamptz,
      ${input.pauseMode ?? null},
      ${input.cardBrand ?? null},
      ${input.cardLastFour ?? null},
      ${input.customerPortalUrl ?? null},
      ${input.updatePaymentMethodUrl ?? null},
      ${input.country ?? null},
      ${input.planSlug ?? null},
      ${JSON.stringify(input.customData ?? {})}::jsonb,
      ${JSON.stringify(input.providerPayload ?? {})}::jsonb
    )
    on conflict (lemon_subscription_id) do update set
      plan_id = excluded.plan_id,
      lemon_customer_id = excluded.lemon_customer_id,
      lemon_order_id = excluded.lemon_order_id,
      lemon_product_id = excluded.lemon_product_id,
      lemon_variant_id = excluded.lemon_variant_id,
      status = excluded.status,
      status_formatted = excluded.status_formatted,
      renews_at = excluded.renews_at,
      ends_at = excluded.ends_at,
      trial_ends_at = excluded.trial_ends_at,
      cancelled_at = excluded.cancelled_at,
      pause_mode = excluded.pause_mode,
      card_brand = excluded.card_brand,
      card_last_four = excluded.card_last_four,
      customer_portal_url = excluded.customer_portal_url,
      update_payment_method_url = excluded.update_payment_method_url,
      country = excluded.country,
      plan_slug = excluded.plan_slug,
      custom_data = excluded.custom_data,
      provider_payload = excluded.provider_payload,
      updated_at = now()
    returning *
  `;

  const keepsCreatorAccess = ["active", "on_trial", "past_due", "paused"].includes(input.status) ||
    (input.status === "cancelled" && isFutureDate(input.endsAt ?? input.renewsAt));

  await prisma.$executeRaw`
    update public.profiles
    set plan = case
      when ${keepsCreatorAccess} then 'CREATOR'
      else 'FREE'
    end,
    updated_at = now()
    where id = ${input.userId}::uuid
  `;

  await prisma.user.updateMany({
    where: { id: input.userId },
    data: {
      planType: keepsCreatorAccess ? "CREATOR" : "FREE"
    }
  });

  return mapSubscription(rows[0]);
}

function text(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function nestedText(source: Record<string, unknown>, path: string[]) {
  let value: unknown = source;
  for (const key of path) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    value = (value as Record<string, unknown>)[key];
  }
  return text(value);
}

export async function cancelCurrentSubscription(userId: string) {
  const subscription = await getActiveSubscription(userId);

  if (!subscription || !hasCreatorAccess(subscription)) {
    throw new Error("No active Creator subscription found.");
  }

  const lemonResponse = await cancelLemonSubscription(subscription.lemonSubscriptionId);
  const attrs = lemonResponse.data?.attributes ?? {};
  const status = attrs.cancelled === true ? "cancelled" : normalizeSubscriptionStatus(attrs.status ?? "cancelled");
  const endsAt = text(attrs.ends_at) ?? subscription.endsAt ?? subscription.renewsAt;
  const renewsAt = text(attrs.renews_at) ?? subscription.renewsAt;

  return upsertSubscription({
    userId,
    planId: subscription.planId,
    lemonSubscriptionId: subscription.lemonSubscriptionId,
    lemonCustomerId: text(attrs.customer_id) ?? subscription.lemonCustomerId,
    lemonOrderId: text(attrs.order_id) ?? subscription.lemonOrderId,
    lemonProductId: text(attrs.product_id) ?? subscription.lemonProductId,
    lemonVariantId: text(attrs.variant_id) ?? subscription.lemonVariantId,
    status,
    statusFormatted: text(attrs.status_formatted) ?? "Cancelled",
    renewsAt,
    endsAt,
    trialEndsAt: text(attrs.trial_ends_at) ?? subscription.trialEndsAt,
    cancelledAt: text(attrs.cancelled_at) ?? new Date().toISOString(),
    pauseMode: nestedText(attrs, ["pause", "mode"]),
    cardBrand: text(attrs.card_brand),
    cardLastFour: text(attrs.card_last_four),
    customerPortalUrl: nestedText(attrs, ["urls", "customer_portal"]) ?? subscription.customerPortalUrl,
    updatePaymentMethodUrl: nestedText(attrs, ["urls", "update_payment_method"]) ?? subscription.updatePaymentMethodUrl,
    country: subscription.country,
    planSlug: subscription.planSlug,
    customData: subscription.customData,
    providerPayload: {
      ...subscription.providerPayload,
      cancellation_response: lemonResponse as unknown as JsonObject
    }
  });
}
