"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { getAuthHeaders, getStoredAuthToken } from "@/frontend/auth/auth-token-storage";

type BillingDebugData = {
  currentUser: {
    id: string;
    email: string | null;
    planType: string;
    createdAt: string | null;
  };
  currentPlan: {
    slug: string;
    displayName: string;
    currency: string | null;
    price: number;
    isFounding: boolean;
  };
  subscriptionStatus: string;
  country: string;
  currentVariant: {
    planSlug: string | null;
    lemonVariantId: string | null;
  };
  renewalDate: string | null;
  webhookStatus: string;
  remainingFounderSlots: number;
  pricingPreview: {
    slug: string;
    displayName: string;
    currency: string;
    price: number;
    isFounding: boolean;
  };
  recentBillingEvents: Array<{
    eventName: string;
    status: string;
    resourceId: string | null;
    errorMessage: string | null;
    createdAt: string;
    processedAt: string | null;
  }>;
};

function formatValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") return "Not available";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function DebugCard({
  label,
  value
}: {
  label: string;
  value: string | number | boolean | null | undefined;
}) {
  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
      <p className="text-xs uppercase text-[var(--app-muted)]">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold">{formatValue(value)}</p>
    </div>
  );
}

export default function BillingDebugPage() {
  const [data, setData] = useState<BillingDebugData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getStoredAuthToken()) {
      setError("Sign in before opening the billing debug dashboard.");
      setLoading(false);
      return;
    }

    axios.get<{ error?: string } & BillingDebugData>("/api/admin/billing-debug", {
      headers: getAuthHeaders()
    })
      .then((res) => setData(res.data))
      .catch((err) => {
        const message = axios.isAxiosError(err)
          ? err.response?.data?.error ?? err.message
          : err instanceof Error
            ? err.message
            : "Unable to load billing debug data.";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-5 py-8 text-[var(--app-text)]">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div>
          <p className="text-sm text-[var(--app-muted)]">Admin</p>
          <h1 className="mt-1 text-3xl font-semibold">Billing Debug</h1>
        </div>

        {loading && <p className="text-[var(--app-muted)]">Loading billing state...</p>}
        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {data && (
          <>
            <section className="grid gap-3 md:grid-cols-3">
              <DebugCard label="Current User" value={data.currentUser.email} />
              <DebugCard label="Current Plan" value={data.currentPlan.displayName} />
              <DebugCard label="Subscription Status" value={data.subscriptionStatus} />
              <DebugCard label="Country" value={data.country} />
              <DebugCard label="Current Variant" value={data.currentVariant.planSlug} />
              <DebugCard label="Renewal Date" value={formatDate(data.renewalDate)} />
              <DebugCard label="Webhook Status" value={data.webhookStatus} />
              <DebugCard label="Remaining Founder Slots" value={data.remainingFounderSlots} />
              <DebugCard
                label="Pricing Preview"
                value={`${data.pricingPreview.displayName} ${data.pricingPreview.currency} ${data.pricingPreview.price}`}
              />
            </section>

            <section className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)]">
              <div className="border-b border-[var(--app-border)] p-4">
                <h2 className="font-semibold">Recent Billing Events</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs uppercase text-[var(--app-muted)]">
                    <tr>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Resource</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Processed</th>
                      <th className="px-4 py-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentBillingEvents.length === 0 ? (
                      <tr>
                        <td className="px-4 py-4 text-[var(--app-muted)]" colSpan={6}>
                          No billing events recorded for this user.
                        </td>
                      </tr>
                    ) : (
                      data.recentBillingEvents.map((event, index) => (
                        <tr key={`${event.eventName}-${event.createdAt}-${index}`} className="border-t border-[var(--app-border)]">
                          <td className="px-4 py-3">{event.eventName}</td>
                          <td className="px-4 py-3">{event.status}</td>
                          <td className="px-4 py-3">{formatValue(event.resourceId)}</td>
                          <td className="px-4 py-3">{formatDate(event.createdAt)}</td>
                          <td className="px-4 py-3">{formatDate(event.processedAt)}</td>
                          <td className="px-4 py-3">{formatValue(event.errorMessage)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
