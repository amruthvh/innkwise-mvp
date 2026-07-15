import { incrementUsageMetric } from "@/backend/creator-os/crud-service";
import type { ContextWorkflow } from "@/backend/context/context-engine";
import type { JsonObject } from "@/shared/types/creator-os";
import type { TokenUsage } from "@/lib/ai/gateway/GatewayTypes";

function period() {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return {
    key: `${now.getUTCFullYear()}-${month}`,
    start: `${now.getUTCFullYear()}-${month}-01`
  };
}

export class UsageTracker {
  async track(input: {
    userId: string;
    workflow: ContextWorkflow;
    latencyMs: number;
    tokenUsage: TokenUsage;
    retryCount: number;
    success: boolean;
    metadata?: JsonObject;
  }) {
    const currentPeriod = period();
    const metadata = {
      workflow: input.workflow,
      latencyMs: input.latencyMs,
      retryCount: input.retryCount,
      success: input.success,
      ...(input.metadata ?? {})
    } as JsonObject;

    await Promise.all([
      incrementUsageMetric({
        userId: input.userId,
        periodKey: currentPeriod.key,
        periodStart: currentPeriod.start,
        metric: "generation",
        count: 1,
        metadata
      }),
      incrementUsageMetric({
        userId: input.userId,
        periodKey: currentPeriod.key,
        periodStart: currentPeriod.start,
        metric: "token",
        count: input.tokenUsage.totalTokens,
        metadata
      })
    ]);
  }
}

export const usageTracker = new UsageTracker();
