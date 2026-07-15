import type { JsonObject } from "@/shared/types/creator-os";

export type BillingRegion = "india" | "global";
export type BillingCurrency = "INR" | "USD";

export type BillingPlanSlug =
  | "founding_creator_india"
  | "creator_india"
  | "founding_creator_global"
  | "creator_global"
  | "pro"
  | "team"
  | "enterprise";

export type SubscriptionStatus =
  | "active"
  | "cancelled"
  | "expired"
  | "on_trial"
  | "past_due"
  | "paused"
  | "unpaid"
  | "pending"
  | "unknown";

export type BillingFeature =
  | "UNLIMITED_PROJECTS"
  | "CREATOR_WORKFLOWS"
  | "KNOWLEDGE_BASE"
  | "ADVANCED_MEMORY"
  | "TEAM_SEATS"
  | "ENTERPRISE_SUPPORT";

export type BillingPlan = {
  id: string;
  slug: BillingPlanSlug;
  displayName: string;
  currency: BillingCurrency;
  price: number;
  variantId?: string;
  region: BillingRegion;
  isFounding: boolean;
  isActive: boolean;
  capabilities: Partial<Record<BillingFeature, boolean>>;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type PricingCohort = {
  id: string;
  slug: "founding_creator" | string;
  displayName: string;
  maxSlots: number;
  claimedSlots: number;
  isOpen: boolean;
  remainingSlots: number;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type Subscription = {
  id: string;
  userId: string;
  planId: string | null;
  lemonSubscriptionId: string;
  lemonCustomerId: string | null;
  lemonOrderId: string | null;
  lemonProductId: string | null;
  lemonVariantId: string | null;
  status: SubscriptionStatus;
  statusFormatted: string | null;
  renewsAt: string | null;
  endsAt: string | null;
  trialEndsAt: string | null;
  cancelledAt: string | null;
  customerPortalUrl: string | null;
  updatePaymentMethodUrl: string | null;
  country: string | null;
  planSlug: BillingPlanSlug | null;
  customData: JsonObject;
  providerPayload: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type SubscriptionSummary = {
  plan: {
    slug: BillingPlanSlug | "free";
    displayName: string;
    currency: BillingCurrency | null;
    price: number;
    isFounding: boolean;
  };
  status: SubscriptionStatus | "free";
  isCreator: boolean;
  renewalDate: string | null;
  manageUrl: string | null;
  features: BillingFeature[];
};

export type PublicPricing = {
  region: BillingRegion;
  country: string;
  activePlan: Pick<BillingPlan, "slug" | "displayName" | "currency" | "price" | "isFounding">;
  cohort: Pick<PricingCohort, "slug" | "displayName" | "maxSlots" | "claimedSlots" | "remainingSlots" | "isOpen">;
};
