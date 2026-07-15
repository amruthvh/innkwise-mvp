import type { NextApiRequest } from "next";
import { prisma } from "@/database/prisma/client";
import type {
  BillingCurrency,
  BillingPlan,
  BillingPlanSlug,
  BillingRegion,
  PricingCohort,
  PublicPricing
} from "@/shared/types/billing";
import type { JsonObject } from "@/shared/types/creator-os";

type DbRow = Record<string, unknown>;

const PLAN_ENV: Array<{
  slug: BillingPlanSlug;
  displayName: string;
  currency: BillingCurrency;
  price: number;
  region: BillingRegion;
  isFounding: boolean;
  env: string;
}> = [
  {
    slug: "founding_creator_india",
    displayName: "Founding Creator",
    currency: "USD",
    price: 4,
    region: "india",
    isFounding: true,
    env: "LEMON_FOUNDER_INDIA_VARIANT_ID"
  },
  {
    slug: "creator_india",
    displayName: "Creator",
    currency: "USD",
    price: 9,
    region: "india",
    isFounding: false,
    env: "LEMON_CREATOR_INDIA_VARIANT_ID"
  },
  {
    slug: "founding_creator_global",
    displayName: "Founding Creator",
    currency: "USD",
    price: 9,
    region: "global",
    isFounding: true,
    env: "LEMON_FOUNDER_GLOBAL_VARIANT_ID"
  },
  {
    slug: "creator_global",
    displayName: "Creator",
    currency: "USD",
    price: 19,
    region: "global",
    isFounding: false,
    env: "LEMON_CREATOR_GLOBAL_VARIANT_ID"
  }
];

const CREATOR_CAPABILITIES = {
  UNLIMITED_PROJECTS: true,
  CREATOR_WORKFLOWS: true,
  KNOWLEDGE_BASE: true,
  ADVANCED_MEMORY: true
};

function getPlanTemplate(slug: BillingPlanSlug) {
  return PLAN_ENV.find((plan) => plan.slug === slug) ?? null;
}

function getVariantEnvNameForSlug(slug: BillingPlanSlug) {
  return getPlanTemplate(slug)?.env ?? null;
}

function getDesiredPlanSlug(region: BillingRegion, foundingOpen: boolean): BillingPlanSlug {
  if (foundingOpen) {
    return region === "india" ? "founding_creator_india" : "founding_creator_global";
  }

  return region === "india" ? "creator_india" : "creator_global";
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function mapPlan(row: DbRow): BillingPlan {
  return {
    id: String(row.id),
    slug: String(row.slug) as BillingPlanSlug,
    displayName: String(row.display_name),
    currency: String(row.currency) as BillingCurrency,
    price: Number(row.price),
    variantId: row.variant_id ? String(row.variant_id) : undefined,
    region: String(row.region) as BillingRegion,
    isFounding: Boolean(row.is_founding),
    isActive: Boolean(row.is_active),
    capabilities: (row.capabilities ?? {}) as BillingPlan["capabilities"],
    metadata: (row.metadata ?? {}) as JsonObject,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function mapCohort(row: DbRow): PricingCohort {
  const maxSlots = Number(row.max_slots ?? 0);
  const claimedSlots = Number(row.claimed_slots ?? 0);
  return {
    id: String(row.id),
    slug: String(row.slug),
    displayName: String(row.display_name),
    maxSlots,
    claimedSlots,
    isOpen: Boolean(row.is_open),
    remainingSlots: Math.max(maxSlots - claimedSlots, 0),
    metadata: (row.metadata ?? {}) as JsonObject,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

export function detectBillingRegion(country?: string | string[] | null): BillingRegion {
  const countryCode = Array.isArray(country) ? country[0] : country;
  return countryCode?.toUpperCase() === "IN" ? "india" : "global";
}

function getHeaderValue(req: NextApiRequest, name: string) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function detectCountryFromAcceptLanguage(value?: string | null) {
  if (!value) return null;

  const localeCountry = value
    .split(",")
    .map((part) => part.trim().split(";")[0])
    .map((locale) => locale.match(/[-_]([A-Za-z]{2})$/)?.[1]?.toUpperCase())
    .find(Boolean);

  return localeCountry ?? null;
}

export function detectCountryFromRequest(req: NextApiRequest) {
  const configuredCountry = process.env.BILLING_COUNTRY_OVERRIDE;
  if (configuredCountry) return configuredCountry.toUpperCase();

  const country =
    getHeaderValue(req, "x-vercel-ip-country") ||
    getHeaderValue(req, "cf-ipcountry") ||
    getHeaderValue(req, "x-country-code") ||
    getHeaderValue(req, "x-appengine-country") ||
    detectCountryFromAcceptLanguage(getHeaderValue(req, "accept-language"));

  return country?.toUpperCase() || "GLOBAL";
}

export async function syncConfiguredPlans() {
  for (const plan of PLAN_ENV) {
    const variantId = process.env[plan.env];
    if (!variantId) continue;

    await prisma.$executeRaw`
      insert into public.plans (
        slug,
        display_name,
        currency,
        price,
        variant_id,
        region,
        is_founding,
        is_active,
        capabilities
      )
      values (
        ${plan.slug},
        ${plan.displayName},
        ${plan.currency},
        ${plan.price},
        ${variantId},
        ${plan.region},
        ${plan.isFounding},
        true,
        ${JSON.stringify(CREATOR_CAPABILITIES)}::jsonb
      )
      on conflict (slug) do update set
        display_name = excluded.display_name,
        currency = excluded.currency,
        price = excluded.price,
        variant_id = excluded.variant_id,
        region = excluded.region,
        is_founding = excluded.is_founding,
        is_active = excluded.is_active,
        capabilities = excluded.capabilities,
        updated_at = now()
    `;
  }
}

export async function getFounderCohort(): Promise<PricingCohort> {
  await prisma.$executeRaw`
    update public.pricing_cohorts
    set
      is_open = claimed_slots < max_slots,
      updated_at = now()
    where slug = 'founding_creator'
      and is_open is distinct from (claimed_slots < max_slots)
  `;

  const rows = await prisma.$queryRaw<DbRow[]>`
    select *
    from public.pricing_cohorts
    where slug = 'founding_creator'
    limit 1
  `;

  if (rows[0]) return mapCohort(rows[0]);

  const inserted = await prisma.$queryRaw<DbRow[]>`
    insert into public.pricing_cohorts (slug, display_name, max_slots, claimed_slots, is_open)
    values ('founding_creator', 'Founding Creator', 100, 0, true)
    on conflict (slug) do update set updated_at = public.pricing_cohorts.updated_at
    returning *
  `;

  return mapCohort(inserted[0]);
}

export async function claimFounderSlot() {
  const rows = await prisma.$queryRaw<DbRow[]>`
    select *
    from public.claim_founding_creator_slot()
  `;

  return rows[0] ? mapCohort(rows[0]) : getFounderCohort();
}

export async function selectCheckoutPlan(region: BillingRegion): Promise<BillingPlan> {
  await syncConfiguredPlans();
  const cohort = await getFounderCohort();
  const desiredSlug = getDesiredPlanSlug(region, cohort.isOpen);
  const envName = getVariantEnvNameForSlug(desiredSlug);
  const configuredVariantId = envName ? process.env[envName] : null;

  if (!configuredVariantId) {
    throw new Error(`${envName ?? desiredSlug} is not configured.`);
  }

  const rows = await prisma.$queryRaw<DbRow[]>`
    select *
    from public.plans
    where slug = ${desiredSlug}
      and variant_id = ${configuredVariantId}
      and is_active = true
    limit 1
  `;

  if (rows[0]) return mapPlan(rows[0]);
  throw new Error(`Billing plan ${desiredSlug} is not configured.`);
}

export async function getPublicPricing(country: string): Promise<PublicPricing> {
  await syncConfiguredPlans();
  const region = detectBillingRegion(country);
  const cohort = await getFounderCohort();
  const desiredSlug = getDesiredPlanSlug(region, cohort.isOpen);
  const rows = await prisma.$queryRaw<DbRow[]>`
    select *
    from public.plans
    where slug = ${desiredSlug}
      and is_active = true
    limit 1
  `;
  const plan = rows[0] ? mapPlan(rows[0]) : null;
  const template = getPlanTemplate(desiredSlug);

  if (!plan && !template) {
    throw new Error(`Billing plan ${desiredSlug} is not configured.`);
  }

  return {
    region,
    country,
    activePlan: {
      slug: plan?.slug ?? template!.slug,
      displayName: plan?.displayName ?? template!.displayName,
      currency: plan?.currency ?? template!.currency,
      price: plan?.price ?? template!.price,
      isFounding: plan?.isFounding ?? template!.isFounding
    },
    cohort: {
      slug: cohort.slug,
      displayName: cohort.displayName,
      maxSlots: cohort.maxSlots,
      claimedSlots: cohort.claimedSlots,
      remainingSlots: cohort.remainingSlots,
      isOpen: cohort.isOpen
    }
  };
}

export async function getPlanByVariantId(variantId: string): Promise<BillingPlan | null> {
  await syncConfiguredPlans();
  const rows = await prisma.$queryRaw<DbRow[]>`
    select *
    from public.plans
    where variant_id = ${variantId}
    limit 1
  `;

  return rows[0] ? mapPlan(rows[0]) : null;
}

export async function getPlanById(planId: string | null | undefined): Promise<BillingPlan | null> {
  if (!planId) return null;
  const rows = await prisma.$queryRaw<DbRow[]>`
    select *
    from public.plans
    where id = ${planId}::uuid
    limit 1
  `;

  return rows[0] ? mapPlan(rows[0]) : null;
}
