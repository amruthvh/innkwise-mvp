"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getAuthHeaders, getStoredAuthToken } from "@/frontend/auth/auth-token-storage";
import type { SubscriptionSummary } from "@/shared/types/billing";

type SubscriptionState = {
  subscription: SubscriptionSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  startCheckout: () => Promise<void>;
  cancelPlan: () => Promise<SubscriptionSummary>;
};

const freeSubscription: SubscriptionSummary = {
  plan: {
    slug: "free",
    displayName: "Free",
    currency: null,
    price: 0,
    isFounding: false
  },
  status: "free",
  isCreator: false,
  renewalDate: null,
  manageUrl: null,
  features: ["CREATOR_WORKFLOWS"]
};

export function useSubscription(): SubscriptionState {
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!getStoredAuthToken()) {
      setSubscription(freeSubscription);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await axios.get<{ subscription: SubscriptionSummary }>("/api/billing/subscription", {
        headers: getAuthHeaders()
      });
      setSubscription(res.data.subscription);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load subscription.";
      setError(message);
      setSubscription(freeSubscription);
    } finally {
      setLoading(false);
    }
  }, []);

  const startCheckout = useCallback(async () => {
    if (!getStoredAuthToken()) {
      window.location.href = "/auth";
      return;
    }

    const res = await axios.post<{ url: string }>("/api/billing/checkout", {}, {
      headers: getAuthHeaders()
    });

    window.location.href = res.data.url;
  }, []);

  const cancelPlan = useCallback(async () => {
    const res = await axios.post<{ subscription: SubscriptionSummary }>("/api/billing/cancel", {}, {
      headers: getAuthHeaders()
    });

    setSubscription(res.data.subscription);
    return res.data.subscription;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    subscription,
    loading,
    error,
    refresh,
    startCheckout,
    cancelPlan
  };
}
