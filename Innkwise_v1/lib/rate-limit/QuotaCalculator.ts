import { getSubscriptionSummary } from "@/backend/billing/subscription";
import { prisma } from "@/database/prisma/client";
import type { TokenUsage } from "@/lib/ai/gateway/GatewayTypes";
import {
  getPlanLimits,
  isGenerationOperation,
  type PlanLimitConfig,
  type RateLimitOperation,
  type RateLimitPlan
} from "@/lib/rate-limit/PlanLimits";
import type { DailyUsageSnapshot } from "@/lib/rate-limit/UsageTracker";
import { rateLimitUsageTracker } from "@/lib/rate-limit/UsageTracker";

export type QuotaState = {
  userId: string;
  plan: RateLimitPlan;
  limits: PlanLimitConfig;
  usage: DailyUsageSnapshot;
  remaining: {
    generations: number | "unlimited";
    embeddings: number | "unlimited";
    uploads: number | "unlimited";
  };
};

function remaining(limit: number | "unlimited", used: number) {
  if (limit === "unlimited") return "unlimited" as const;
  return Math.max(0, limit - used);
}

async function isAdminUser(userId: string) {
  const configuredIds = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (configuredIds.includes(userId)) return true;

  try {
    const rows = await prisma.$queryRaw<Array<{ plan: string | null }>>`
      select plan
      from public.profiles
      where id = ${userId}::uuid
      limit 1
    `;
    return String(rows[0]?.plan ?? "").toUpperCase() === "ADMIN";
  } catch (error) {
    console.warn("[rate-limit] unable to resolve admin profile; defaulting to non-admin", {
      user_id: userId,
      message: error instanceof Error ? error.message : "Unknown database error"
    });
    return false;
  }
}

export class QuotaCalculator {
  async resolvePlan(userId: string): Promise<RateLimitPlan> {
    if (await isAdminUser(userId)) return "admin";

    try {
      const subscription = await getSubscriptionSummary(userId);
      const slug = subscription.plan.slug.toLowerCase();
      if (subscription.isCreator || slug.includes("creator") || slug === "pro") return "pro";
      return "free";
    } catch (error) {
      console.warn("[rate-limit] unable to resolve subscription; defaulting to free plan", {
        user_id: userId,
        message: error instanceof Error ? error.message : "Unknown database error"
      });
      return "free";
    }
  }

  async remainingQuota(userId: string): Promise<QuotaState> {
    const plan = await this.resolvePlan(userId);
    const limits = getPlanLimits(plan);
    const usage = await rateLimitUsageTracker.getDailyUsage(userId);

    return {
      userId,
      plan,
      limits,
      usage,
      remaining: {
        generations: remaining(limits.aiGenerationsPerDay, usage.ai_generation),
        embeddings: remaining(limits.embeddingsPerDay, usage.embedding),
        uploads: remaining(limits.uploadsPerDay, usage.upload)
      }
    };
  }

  async checkQuota(input: {
    userId: string;
    operation: RateLimitOperation;
    quota?: QuotaState;
  }) {
    const quota = input.quota ?? await this.remainingQuota(input.userId);
    if (quota.plan === "admin") return { allowed: true, quota };

    if (isGenerationOperation(input.operation)) {
      return {
        allowed: quota.remaining.generations === "unlimited" || quota.remaining.generations > 0,
        quota
      };
    }

    if (input.operation === "embedding_generation") {
      return {
        allowed: quota.remaining.embeddings === "unlimited" || quota.remaining.embeddings > 0,
        quota
      };
    }

    if (input.operation === "file_upload") {
      return {
        allowed: quota.remaining.uploads === "unlimited" || quota.remaining.uploads > 0,
        quota
      };
    }

    return { allowed: true, quota };
  }

  async consumeQuota(input: {
    userId: string;
    operation: RateLimitOperation;
    tokenUsage?: TokenUsage;
    latencyMs?: number;
    quota?: QuotaState;
  }) {
    const quota = input.quota ?? await this.remainingQuota(input.userId);
    if (quota.plan === "admin") return quota;
    const increments: Array<Promise<void>> = [];

    if (isGenerationOperation(input.operation)) {
      increments.push(rateLimitUsageTracker.increment({
        userId: input.userId,
        metric: "ai_generation",
        count: 1,
        plan: quota.plan,
        operation: input.operation
      }));
    }

    if (input.operation === "embedding_generation") {
      increments.push(rateLimitUsageTracker.increment({
        userId: input.userId,
        metric: "embedding",
        count: 1,
        plan: quota.plan,
        operation: input.operation
      }));
    }

    if (input.operation === "file_upload") {
      increments.push(rateLimitUsageTracker.increment({
        userId: input.userId,
        metric: "upload",
        count: 1,
        plan: quota.plan,
        operation: input.operation
      }));
    }

    if (input.tokenUsage) {
      increments.push(
        rateLimitUsageTracker.increment({
          userId: input.userId,
          metric: "prompt_token",
          count: input.tokenUsage.promptTokens,
          plan: quota.plan,
          operation: input.operation
        }),
        rateLimitUsageTracker.increment({
          userId: input.userId,
          metric: "completion_token",
          count: input.tokenUsage.completionTokens,
          plan: quota.plan,
          operation: input.operation
        })
      );
    }

    if (typeof input.latencyMs === "number" && Number.isFinite(input.latencyMs)) {
      increments.push(rateLimitUsageTracker.increment({
        userId: input.userId,
        metric: "latency_ms",
        count: Math.max(0, Math.round(input.latencyMs)),
        plan: quota.plan,
        operation: input.operation
      }));
    }

    await Promise.all(increments);

    return {
      ...quota,
      usage: {
        ...quota.usage,
        ai_generation: quota.usage.ai_generation + (isGenerationOperation(input.operation) ? 1 : 0),
        embedding: quota.usage.embedding + (input.operation === "embedding_generation" ? 1 : 0),
        upload: quota.usage.upload + (input.operation === "file_upload" ? 1 : 0),
        prompt_token: quota.usage.prompt_token + (input.tokenUsage?.promptTokens ?? 0),
        completion_token: quota.usage.completion_token + (input.tokenUsage?.completionTokens ?? 0),
        latency_ms: quota.usage.latency_ms + (
          typeof input.latencyMs === "number" && Number.isFinite(input.latencyMs)
            ? Math.max(0, Math.round(input.latencyMs))
            : 0
        )
      },
      remaining: {
        generations: isGenerationOperation(input.operation) && quota.remaining.generations !== "unlimited"
          ? Math.max(0, quota.remaining.generations - 1)
          : quota.remaining.generations,
        embeddings: input.operation === "embedding_generation" && quota.remaining.embeddings !== "unlimited"
          ? Math.max(0, quota.remaining.embeddings - 1)
          : quota.remaining.embeddings,
        uploads: input.operation === "file_upload" && quota.remaining.uploads !== "unlimited"
          ? Math.max(0, quota.remaining.uploads - 1)
          : quota.remaining.uploads
      }
    };
  }

  resetWindow() {
    return new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
}

export const quotaCalculator = new QuotaCalculator();
