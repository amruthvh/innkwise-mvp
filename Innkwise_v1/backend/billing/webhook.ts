import { prisma } from "@/database/prisma/client";
import { claimFounderSlot, getPlanByVariantId } from "@/backend/billing/pricing";
import { normalizeSubscriptionStatus, upsertSubscription } from "@/backend/billing/subscription";
import type { JsonObject } from "@/shared/types/creator-os";

type LemonWebhookPayload = {
  meta?: {
    event_name?: string;
    webhook_id?: string;
    custom_data?: Record<string, unknown>;
  };
  data?: {
    id?: string;
    type?: string;
    attributes?: Record<string, unknown>;
  };
};

const SUPPORTED_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_payment_success",
  "subscription_payment_failed",
  "subscription_expired"
]);

function text(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function jsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function getNestedString(source: Record<string, unknown>, path: string[]) {
  let value: unknown = source;
  for (const key of path) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    value = (value as Record<string, unknown>)[key];
  }
  return text(value);
}

function buildEventId(payload: LemonWebhookPayload) {
  const eventName = payload.meta?.event_name ?? "unknown";
  const resourceId = payload.data?.id ?? "unknown";
  const updatedAt = text(payload.data?.attributes?.updated_at) ?? text(payload.data?.attributes?.created_at) ?? "no-date";
  return payload.meta?.webhook_id ?? `${eventName}:${payload.data?.type ?? "resource"}:${resourceId}:${updatedAt}`;
}

async function insertWebhookLog(payload: LemonWebhookPayload) {
  const eventName = payload.meta?.event_name ?? "unknown";
  const eventId = buildEventId(payload);
  const resourceId = payload.data?.id ?? null;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    insert into public.webhook_logs (
      provider,
      event_name,
      event_id,
      resource_id,
      payload
    )
    values (
      'lemonsqueezy',
      ${eventName},
      ${eventId},
      ${resourceId},
      ${JSON.stringify(payload)}::jsonb
    )
    on conflict (event_id) do nothing
    returning id
  `;

  return rows[0]?.id ?? null;
}

async function completeWebhookLog(id: string, status: "processed" | "failed" | "ignored", error?: string) {
  await prisma.$executeRaw`
    update public.webhook_logs
    set
      processing_status = ${status},
      processed_at = now(),
      error_message = ${error ?? null},
      updated_at = now()
    where id = ${id}::uuid
  `;
}

async function updatePaymentStatus(payload: LemonWebhookPayload, status: "active" | "past_due") {
  const attrs = payload.data?.attributes ?? {};
  const subscriptionId = text(attrs.subscription_id);
  if (!subscriptionId) return;

  await prisma.$executeRaw`
    update public.subscriptions
    set
      status = ${status},
      provider_payload = provider_payload || ${JSON.stringify({ last_payment_event: payload })}::jsonb,
      updated_at = now()
    where lemon_subscription_id = ${subscriptionId}
  `;
}

async function upsertSubscriptionFromWebhook(payload: LemonWebhookPayload) {
  const attrs = payload.data?.attributes ?? {};
  const customData = {
    ...jsonObject(payload.meta?.custom_data),
    ...jsonObject(attrs.custom_data)
  };
  const userId = text(customData.user_id);
  const variantId = text(attrs.variant_id);

  if (!userId) {
    throw new Error("Webhook is missing custom_data.user_id.");
  }

  const plan = variantId ? await getPlanByVariantId(variantId) : null;
  const subscriptionId = text(payload.data?.id) ?? text(attrs.subscription_id);

  if (!subscriptionId) {
    throw new Error("Webhook is missing subscription id.");
  }

  await upsertSubscription({
    userId,
    planId: plan?.id ?? null,
    lemonSubscriptionId: subscriptionId,
    lemonCustomerId: text(attrs.customer_id),
    lemonOrderId: text(attrs.order_id),
    lemonProductId: text(attrs.product_id),
    lemonVariantId: variantId,
    status: attrs.cancelled === true || payload.meta?.event_name === "subscription_cancelled"
      ? "cancelled"
      : normalizeSubscriptionStatus(attrs.status),
    statusFormatted: text(attrs.status_formatted),
    renewsAt: text(attrs.renews_at),
    endsAt: text(attrs.ends_at),
    trialEndsAt: text(attrs.trial_ends_at),
    cancelledAt: text(attrs.cancelled_at),
    pauseMode: getNestedString(attrs, ["pause", "mode"]),
    cardBrand: text(attrs.card_brand),
    cardLastFour: text(attrs.card_last_four),
    customerPortalUrl: getNestedString(attrs, ["urls", "customer_portal"]),
    updatePaymentMethodUrl: getNestedString(attrs, ["urls", "update_payment_method"]),
    country: text(customData.country),
    planSlug: plan?.slug ?? text(customData.plan_slug),
    customData: customData as JsonObject,
    providerPayload: payload as JsonObject
  });

  if (payload.meta?.event_name === "subscription_created" && plan?.isFounding) {
    await claimFounderSlot();
  }
}

export async function processLemonWebhook(payload: LemonWebhookPayload) {
  const logId = await insertWebhookLog(payload);
  if (!logId) {
    return { duplicate: true };
  }

  const eventName = payload.meta?.event_name ?? "unknown";

  try {
    if (!SUPPORTED_EVENTS.has(eventName)) {
      await completeWebhookLog(logId, "ignored");
      return { ignored: true };
    }

    if (
      eventName === "subscription_created" ||
      eventName === "subscription_updated" ||
      eventName === "subscription_cancelled" ||
      eventName === "subscription_expired"
    ) {
      await upsertSubscriptionFromWebhook(payload);
    }

    if (eventName === "subscription_payment_success") {
      await updatePaymentStatus(payload, "active");
    }

    if (eventName === "subscription_payment_failed") {
      await updatePaymentStatus(payload, "past_due");
    }

    await completeWebhookLog(logId, "processed");
    return { processed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await completeWebhookLog(logId, "failed", message);
    throw error;
  }
}
