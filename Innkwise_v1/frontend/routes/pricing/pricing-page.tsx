"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Check, Loader2, Minus } from "lucide-react";
import { useSession } from "next-auth/react";
import { getAuthHeaders, getStoredAuthToken, storeAuthToken } from "@/frontend/auth/auth-token-storage";
import { useSubscription } from "@/frontend/hooks/use-subscription";
import { BrandLockup } from "@/frontend/components/innkwise-brand";
import type { PublicPricing } from "@/shared/types/billing";

const freeFeatures = [
  "AI Chat Workspace",
  "2 Projects",
  "5 AI Script Generations per month",
  "5 Research Sessions",
  "3 Knowledge Uploads",
  "1 Creator Persona",
  "Standard AI Model",
  "Copy Output",
  "Community Support"
];

const creatorFeatures = [
  "Everything in Free",
  "Unlimited Projects",
  "Unlimited AI Chat",
  "Unlimited Script Generation (Fair Usage)",
  "Unlimited Research",
  "Unlimited Knowledge Sources",
  "Multiple Creator Personas",
  "Advanced Context Memory",
  "Project Memory",
  "Script Refinement",
  "Content Repurposing",
  "DOCX Export",
  "Priority AI Queue",
  "Priority Support",
  "Early Access Features"
];

const comparisonRows = [
  ["AI Chat Workspace", "Included", "Unlimited"],
  ["Projects", "2", "Unlimited"],
  ["AI Script Generations", "5 / month", "Unlimited, fair usage"],
  ["Research Sessions", "5", "Unlimited"],
  ["Knowledge Uploads", "3", "Unlimited"],
  ["Creator Personas", "1", "Multiple"],
  ["AI Model", "Standard", "Priority AI Queue"],
  ["Context Memory", "Basic", "Advanced + Project Memory"],
  ["Script Refinement", "Limited", "Included"],
  ["Content Repurposing", "Not included", "Included"],
  ["DOCX Export", "Not included", "Included"],
  ["Support", "Community", "Priority"]
];

const faqs = [
  {
    question: "Why regional pricing?",
    answer: "Creator economics vary by region. Regional pricing keeps Innkwise accessible without changing the product quality or feature set."
  },
  {
    question: "Can I cancel anytime?",
    answer: "Yes. You can cancel from your billing portal, and your Creator access remains active until the end of the paid period."
  },
  {
    question: "Will Founder pricing increase?",
    answer: "No. Founder pricing is lifetime pricing for the first 100 Founder memberships as long as the subscription remains active."
  },
  {
    question: "What happens after Founder pricing ends?",
    answer: "The page automatically switches to standard Creator pricing. No deployment or manual pricing change is required."
  },
  {
    question: "Can I upgrade later?",
    answer: "Yes. You can start on Free and upgrade to Creator whenever you are ready."
  }
];

function formatPrice(pricing: PublicPricing | null) {
  if (!pricing) return "$9";
  return `$${pricing.activePlan.price}`;
}

function getCheckoutReturnPath() {
  return "/pricing?checkout=1";
}

function FeatureLine({ children }: { children: string }) {
  return (
    <li className="flex gap-3 text-sm leading-6 text-[var(--app-text-muted)]">
      <Check size={16} className="mt-1 shrink-0 text-[var(--app-text)]" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

function PlanCard({
  name,
  eyebrow,
  description,
  price,
  features,
  highlighted = false,
  badge,
  action
}: {
  name: string;
  eyebrow: string;
  description: string;
  price: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  action: React.ReactNode;
}) {
  return (
    <article
      className={`rounded-xl border p-6 transition duration-150 ${
        highlighted
          ? "border-[var(--app-text)] bg-[var(--app-surface)] shadow-[0_18px_60px_rgba(0,0,0,0.10)]"
          : "border-[var(--app-border)] bg-[var(--app-surface-muted)] hover:bg-[var(--app-surface)]"
      }`}
    >
      <div className="flex min-h-[116px] flex-col justify-between gap-5">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--app-muted)]">{eyebrow}</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-normal">{name}</h2>
            </div>
            {badge && (
              <span className="rounded-full border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-1 text-xs font-semibold">
                {badge}
              </span>
            )}
          </div>
          <p className="text-sm leading-6 text-[var(--app-text-muted)]">{description}</p>
        </div>
        <div>
          <span className="text-4xl font-semibold">{price}</span>
          {price !== "Free" && <span className="ml-1 text-sm text-[var(--app-muted)]">/ month</span>}
        </div>
      </div>

      <div className="mt-6">{action}</div>

      <ul className="mt-6 space-y-2">
        {features.map((feature) => (
          <FeatureLine key={feature}>{feature}</FeatureLine>
        ))}
      </ul>
    </article>
  );
}

function ComparisonTable() {
  return (
    <section className="space-y-4" aria-labelledby="comparison-heading">
      <div>
        <p className="text-sm font-medium text-[var(--app-muted)]">Compare</p>
        <h2 id="comparison-heading" className="mt-1 text-2xl font-semibold">Feature comparison</h2>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--app-border)] text-[var(--app-muted)]">
              <th scope="col" className="px-5 py-4 font-semibold">Feature</th>
              <th scope="col" className="px-5 py-4 font-semibold">Free</th>
              <th scope="col" className="px-5 py-4 font-semibold">Creator</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map(([feature, free, creator]) => (
              <tr key={feature} className="border-b border-[var(--app-border)] last:border-0">
                <th scope="row" className="px-5 py-4 font-medium">{feature}</th>
                <td className="px-5 py-4 text-[var(--app-text-muted)]">{free === "Not included" ? <MinusText /> : free}</td>
                <td className="px-5 py-4 text-[var(--app-text)]">{creator}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MinusText() {
  return (
    <span className="inline-flex items-center gap-2 text-[var(--app-muted)]">
      <Minus size={14} aria-hidden="true" />
      Not included
    </span>
  );
}

function FAQSection() {
  return (
    <section className="space-y-4" aria-labelledby="faq-heading">
      <div>
        <p className="text-sm font-medium text-[var(--app-muted)]">FAQ</p>
        <h2 id="faq-heading" className="mt-1 text-2xl font-semibold">Common questions</h2>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {faqs.map((faq) => (
          <details key={faq.question} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-5">
            <summary className="cursor-pointer text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-text)]">
              {faq.question}
            </summary>
            <p className="mt-3 text-sm leading-6 text-[var(--app-text-muted)]">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export default function PricingPage() {
  const { data: session, status } = useSession();
  const { subscription, loading: subscriptionLoading, startCheckout } = useSubscription();
  const [pricing, setPricing] = useState<PublicPricing | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    if (session?.appAuthToken) {
      storeAuthToken(session.appAuthToken);
    }
  }, [session]);

  useEffect(() => {
    let mounted = true;
    axios
      .get<{ pricing: PublicPricing }>("/api/billing/pricing")
      .then((res) => {
        if (mounted) setPricing(res.data.pricing);
      })
      .catch((error) => {
        if (mounted) setPricingError(error instanceof Error ? error.message : "Unable to load pricing.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const shouldAutoCheckout = typeof window !== "undefined" && new URL(window.location.href).searchParams.get("checkout") === "1";

  const handleUpgrade = async () => {
    if (subscription?.isCreator) return;

    if (!getStoredAuthToken()) {
      window.location.href = `/auth?returnTo=${encodeURIComponent(getCheckoutReturnPath())}`;
      return;
    }

    try {
      setCheckoutLoading(true);
      await startCheckout();
    } catch (error) {
      setPricingError(
        axios.isAxiosError(error)
          ? error.response?.data?.error ?? "Unable to start checkout."
          : "Unable to start checkout."
      );
      setCheckoutLoading(false);
    }
  };

  useEffect(() => {
    if (!shouldAutoCheckout || status === "loading" || checkoutLoading || subscriptionLoading) return;
    if (subscription?.isCreator) return;
    if (getStoredAuthToken()) {
      void handleUpgrade();
    }
  }, [checkoutLoading, shouldAutoCheckout, status, subscription?.isCreator, subscriptionLoading]);

  const isCreator = Boolean(subscription?.isCreator);
  const founderOpen = pricing?.activePlan.isFounding ?? true;
  const creatorBadge = founderOpen ? "Founding Creator" : undefined;
  const creatorSubtitle = founderOpen ? "Lifetime Founder Pricing" : "Creator plan";

  const upgradeButton = (
    <button
      type="button"
      onClick={() => void handleUpgrade()}
      disabled={checkoutLoading || subscriptionLoading || isCreator}
      aria-label={isCreator ? "Current Creator plan" : "Upgrade to Creator"}
      className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--app-text)] px-4 text-sm font-semibold text-[var(--app-bg)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {checkoutLoading ? (
        <>
          <Loader2 size={16} className="mr-2 animate-spin" aria-hidden="true" />
          Opening checkout
        </>
      ) : isCreator ? (
        "Current Plan"
      ) : founderOpen ? (
        "Claim Founder Pricing"
      ) : (
        "Upgrade to Creator"
      )}
    </button>
  );

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-5 py-8 text-[var(--app-text)] sm:px-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12">
        <header className="flex flex-col items-center gap-8 border-b border-[var(--app-border)] pb-10 text-center">
          <div className="space-y-5">
            <a href="/" aria-label="Go to Innkwise home"><BrandLockup /></a>
          </div>

          <div className="w-full max-w-xl rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-6 text-sm text-[var(--app-text-muted)] shadow-[0_18px_60px_rgba(0,0,0,0.08)]">
            <p className="text-lg font-semibold text-[var(--app-text)]">{founderOpen ? "Founder memberships are open" : "Founder memberships are full"}</p>
            <p className="mt-2 text-base">
              {founderOpen
                ? `Only ${pricing?.cohort.remainingSlots ?? 100} Founder Spots Remaining.`
                : "Standard Creator pricing is now active."}
            </p>
            <button
              type="button"
              onClick={() => void handleUpgrade()}
              disabled={checkoutLoading || subscriptionLoading || isCreator}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-[var(--app-text)] px-4 text-sm font-semibold text-[var(--app-bg)] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isCreator ? "Current Plan" : founderOpen ? "Claim Founder Pricing" : "Upgrade to Creator"}
            </button>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-2" aria-label="Pricing plans">
          <PlanCard
            name="Free"
            eyebrow="Start"
            description="A focused workspace for trying Innkwise and building your first creator workflow."
            price="Free"
            features={freeFeatures}
            action={
              <a
                href="/auth?returnTo=/dashboard"
                className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-4 text-sm font-semibold transition hover:bg-[var(--app-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-text)]"
              >
                Start Free
              </a>
            }
          />

          <PlanCard
            name="Creator"
            eyebrow={creatorSubtitle}
            description="For creators who want Innkwise to remember their work, plan strategically, and produce across formats."
            price={formatPrice(pricing)}
            features={creatorFeatures}
            highlighted
            badge={creatorBadge}
            action={upgradeButton}
          />
        </section>

        {pricingError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300" role="alert">
            {pricingError}
          </div>
        )}

        <ComparisonTable />
        <FAQSection />
      </div>
    </main>
  );
}
