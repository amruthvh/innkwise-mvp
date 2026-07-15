import crypto from "crypto";
import type { BillingPlan } from "@/shared/types/billing";

const LEMON_API_URL = "https://api.lemonsqueezy.com/v1";

type CheckoutInput = {
  plan: BillingPlan;
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
  country: string;
  successUrl: string;
  cancelUrl: string;
};

type LemonCheckoutResponse = {
  data?: {
    attributes?: {
      url?: string;
    };
  };
};

type LemonSubscriptionResponse = {
  data?: {
    id?: string;
    attributes?: Record<string, unknown>;
  };
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function getLemonProductId() {
  return getRequiredEnv("LEMONSQUEEZY_PRODUCT_ID");
}

export function getLemonStoreId() {
  return getRequiredEnv("LEMONSQUEEZY_STORE_ID");
}

export function verifyLemonSignature(rawBody: Buffer, signature: string | string[] | undefined) {
  const secret = getRequiredEnv("LEMONSQUEEZY_WEBHOOK_SECRET");
  const providedSignature = Array.isArray(signature) ? signature[0] : signature;

  if (!providedSignature) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expected = Buffer.from(digest, "hex");
  const received = Buffer.from(providedSignature, "hex");

  if (received.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, received);
}

export async function createLemonCheckout(input: CheckoutInput) {
  const apiKey = getRequiredEnv("LEMONSQUEEZY_API_KEY");
  const storeId = getLemonStoreId();
  getLemonProductId();

  const response = await fetch(`${LEMON_API_URL}/checkouts`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          product_options: {
            enabled_variants: [Number(input.plan.variantId)],
            redirect_url: input.successUrl,
            receipt_button_text: "Open Innkwise",
            receipt_link_url: input.successUrl
          },
          checkout_options: {
            embed: false,
            media: true,
            logo: true,
            desc: true,
            discount: true,
            subscription_preview: true
          },
          checkout_data: {
            email: input.user.email,
            name: input.user.name ?? undefined,
            billing_address: input.country !== "GLOBAL" ? { country: input.country } : undefined,
            custom: {
              user_id: input.user.id,
              email: input.user.email,
              country: input.country,
              plan_slug: input.plan.slug
            }
          }
        },
        relationships: {
          store: {
            data: {
              type: "stores",
              id: storeId
            }
          },
          variant: {
            data: {
              type: "variants",
              id: input.plan.variantId
            }
          }
        }
      }
    })
  });

  const payload = (await response.json().catch(() => ({}))) as LemonCheckoutResponse & { errors?: unknown };

  if (!response.ok) {
    throw new Error(`Lemon Squeezy checkout failed: ${JSON.stringify(payload.errors ?? payload)}`);
  }

  const url = payload.data?.attributes?.url;
  if (!url) {
    throw new Error("Lemon Squeezy did not return a checkout URL.");
  }

  return { url };
}

export async function cancelLemonSubscription(subscriptionId: string) {
  const apiKey = getRequiredEnv("LEMONSQUEEZY_API_KEY");

  const response = await fetch(`${LEMON_API_URL}/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      data: {
        type: "subscriptions",
        id: subscriptionId,
        attributes: {
          cancelled: true
        }
      }
    })
  });

  const payload = (await response.json().catch(() => ({}))) as LemonSubscriptionResponse & { errors?: unknown };

  if (!response.ok) {
    throw new Error(`Lemon Squeezy cancellation failed: ${JSON.stringify(payload.errors ?? payload)}`);
  }

  return payload;
}
