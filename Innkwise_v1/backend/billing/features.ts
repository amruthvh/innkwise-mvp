import type { BillingFeature, BillingPlanSlug, SubscriptionSummary } from "@/shared/types/billing";

const PLAN_FEATURES: Record<string, BillingFeature[]> = {
  free: ["CREATOR_WORKFLOWS"],
  founding_creator_india: [
    "UNLIMITED_PROJECTS",
    "CREATOR_WORKFLOWS",
    "KNOWLEDGE_BASE",
    "ADVANCED_MEMORY"
  ],
  founding_creator_global: [
    "UNLIMITED_PROJECTS",
    "CREATOR_WORKFLOWS",
    "KNOWLEDGE_BASE",
    "ADVANCED_MEMORY"
  ],
  creator_india: [
    "UNLIMITED_PROJECTS",
    "CREATOR_WORKFLOWS",
    "KNOWLEDGE_BASE",
    "ADVANCED_MEMORY"
  ],
  creator_global: [
    "UNLIMITED_PROJECTS",
    "CREATOR_WORKFLOWS",
    "KNOWLEDGE_BASE",
    "ADVANCED_MEMORY"
  ],
  pro: [
    "UNLIMITED_PROJECTS",
    "CREATOR_WORKFLOWS",
    "KNOWLEDGE_BASE",
    "ADVANCED_MEMORY"
  ],
  team: [
    "UNLIMITED_PROJECTS",
    "CREATOR_WORKFLOWS",
    "KNOWLEDGE_BASE",
    "ADVANCED_MEMORY",
    "TEAM_SEATS"
  ],
  enterprise: [
    "UNLIMITED_PROJECTS",
    "CREATOR_WORKFLOWS",
    "KNOWLEDGE_BASE",
    "ADVANCED_MEMORY",
    "TEAM_SEATS",
    "ENTERPRISE_SUPPORT"
  ]
};

export function getFeaturesForPlan(planSlug: BillingPlanSlug | "free" | null | undefined): BillingFeature[] {
  return PLAN_FEATURES[planSlug ?? "free"] ?? PLAN_FEATURES.free;
}

export function hasFeature(
  subscription: Pick<SubscriptionSummary, "plan" | "features"> | null | undefined,
  feature: BillingFeature
) {
  if (!subscription) return getFeaturesForPlan("free").includes(feature);
  return subscription.features.includes(feature);
}
