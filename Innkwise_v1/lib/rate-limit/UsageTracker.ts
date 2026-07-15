import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma/client";
import type { JsonObject } from "@/shared/types/creator-os";
import type { RateLimitOperation, RateLimitPlan } from "@/lib/rate-limit/PlanLimits";

export type RateLimitUsageMetric =
  | "ai_generation"
  | "prompt_token"
  | "completion_token"
  | "embedding"
  | "upload"
  | "latency_ms"
  | "failed_request"
  | "blocked_request";

export type DailyUsageSnapshot = Record<RateLimitUsageMetric, number>;

const usageMetrics: RateLimitUsageMetric[] = [
  "ai_generation",
  "prompt_token",
  "completion_token",
  "embedding",
  "upload",
  "latency_ms",
  "failed_request",
  "blocked_request"
];

function jsonb(value: JsonObject | null | undefined) {
  return Prisma.sql`${JSON.stringify(value ?? {})}::jsonb`;
}

export function getDailyWindow(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return {
    periodKey: `${year}-${month}-${day}`,
    periodStart: `${year}-${month}-${day}`
  };
}

export class RateLimitUsageTracker {
  async getDailyUsage(userId: string, date = new Date()): Promise<DailyUsageSnapshot> {
    const window = getDailyWindow(date);
    const snapshot = Object.fromEntries(usageMetrics.map((metric) => [metric, 0])) as DailyUsageSnapshot;
    try {
      const rows = await prisma.$queryRaw<Array<{ metric: RateLimitUsageMetric; count: number }>>`
        select metric, count
        from public.usage
        where user_id = ${userId}::uuid
          and period_key = ${window.periodKey}
          and metric in (${Prisma.join(usageMetrics)})
      `;

      for (const row of rows) {
        snapshot[row.metric] = Number(row.count ?? 0);
      }
    } catch (error) {
      console.warn("[rate-limit] unable to read daily usage; using zero usage snapshot", {
        user_id: userId,
        message: error instanceof Error ? error.message : "Unknown database error"
      });
    }
    return snapshot;
  }

  async increment(input: {
    userId: string;
    metric: RateLimitUsageMetric;
    count: number;
    plan: RateLimitPlan;
    operation: RateLimitOperation;
    metadata?: JsonObject;
  }) {
    const window = getDailyWindow();
    try {
      await prisma.$executeRaw`
        insert into public.usage (user_id, period_key, period_start, metric, count, credits_used, metadata)
        values (
          ${input.userId}::uuid,
          ${window.periodKey},
          ${window.periodStart}::date,
          ${input.metric},
          ${input.count},
          0,
          ${jsonb({
            plan: input.plan,
            operation: input.operation,
            ...(input.metadata ?? {})
          })}
        )
        on conflict (user_id, period_key, metric) do update set
          count = public.usage.count + excluded.count,
          metadata = public.usage.metadata || excluded.metadata,
          updated_at = now()
      `;
    } catch (error) {
      console.warn("[rate-limit] unable to persist usage increment", {
        user_id: input.userId,
        metric: input.metric,
        message: error instanceof Error ? error.message : "Unknown database error"
      });
    }
  }

  async trackFailure(input: {
    userId: string;
    plan: RateLimitPlan;
    operation: RateLimitOperation;
    blocked?: boolean;
    metadata?: JsonObject;
  }) {
    await this.increment({
      userId: input.userId,
      metric: input.blocked ? "blocked_request" : "failed_request",
      count: 1,
      plan: input.plan,
      operation: input.operation,
      metadata: input.metadata
    });
  }
}

export const rateLimitUsageTracker = new RateLimitUsageTracker();
