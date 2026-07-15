import type { JsonObject } from "@/shared/types/creator-os";
import {
  getPlanLimits,
  isGenerationOperation,
  operationLabel,
  type RateLimitOperation,
  type RateLimitPlan
} from "@/lib/rate-limit/PlanLimits";
import { RateLimitError } from "@/lib/rate-limit/RateLimitErrors";
import { quotaCalculator, type QuotaState } from "@/lib/rate-limit/QuotaCalculator";
import { rateLimitUsageTracker } from "@/lib/rate-limit/UsageTracker";

type UserAbuseState = {
  requestTimestamps: number[];
  failedTimestamps: number[];
  uploadTimestamps: number[];
  blockedUntil: number;
};

const abuseState = new Map<string, UserAbuseState>();
const REQUEST_BURST_LIMIT = 50;
const REQUEST_BURST_WINDOW_MS = 30_000;
const FAILED_REQUEST_LIMIT = 10;
const FAILED_REQUEST_WINDOW_MS = 5 * 60_000;
const UPLOAD_ABUSE_LIMIT = 20;
const UPLOAD_ABUSE_WINDOW_MS = 5 * 60_000;
const TEMP_BLOCK_MS = 10 * 60_000;

function stateFor(userId: string) {
  const state = abuseState.get(userId) ?? {
    requestTimestamps: [],
    failedTimestamps: [],
    uploadTimestamps: [],
    blockedUntil: 0
  };
  abuseState.set(userId, state);
  return state;
}

function prune(values: number[], windowMs: number, now = Date.now()) {
  return values.filter((timestamp) => now - timestamp < windowMs);
}

function remainingResponse(quota: QuotaState) {
  return quota.remaining;
}

function quotaMessage(operation: RateLimitOperation) {
  if (operation === "embedding_generation") {
    return "You've reached today's embedding limit. Upgrade to Creator or try again tomorrow.";
  }
  if (operation === "file_upload") {
    return "You've reached today's upload limit. Upgrade to Creator or try again tomorrow.";
  }
  return "You've reached today's AI generation limit. Upgrade to Creator or try again tomorrow.";
}

export class RateLimiter {
  async checkQuota(input: {
    userId: string;
    operation: RateLimitOperation;
    prompt?: string;
  }) {
    const quota = await quotaCalculator.remainingQuota(input.userId);
    this.validatePrompt(input.prompt ?? "", quota.plan);
    await this.detectAbuse(input.userId, quota.plan, input.operation, quota);

    const result = await quotaCalculator.checkQuota({
      userId: input.userId,
      operation: input.operation
    });

    if (!result.allowed) {
      await this.logBlocked({
        userId: input.userId,
        plan: result.quota.plan,
        operation: input.operation,
        reason: "quota_exceeded"
      });
      throw new RateLimitError("RATE_LIMIT_EXCEEDED", quotaMessage(input.operation), remainingResponse(result.quota));
    }

    return result.quota;
  }

  async consumeQuota(input: {
    userId: string;
    operation: RateLimitOperation;
    tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    latencyMs?: number;
  }) {
    const quota = await quotaCalculator.consumeQuota(input);
    console.info("[rate-limit] quota consumed", {
      user_id: input.userId,
      plan: quota.plan,
      operation: input.operation,
      remaining: quota.remaining,
      latency: input.latencyMs
    });
    return quota;
  }

  async remainingQuota(userId: string) {
    return quotaCalculator.remainingQuota(userId);
  }

  resetWindow() {
    return quotaCalculator.resetWindow();
  }

  validatePrompt(prompt: string, plan: RateLimitPlan) {
    const trimmed = prompt.trim();
    const limits = getPlanLimits(plan);
    const remaining = {
      generations: "unlimited" as const,
      embeddings: "unlimited" as const,
      uploads: "unlimited" as const
    };

    if (!trimmed) {
      throw new RateLimitError("EMPTY_PROMPT", "Please enter a prompt before generating.", remaining);
    }

    if (limits.maxPromptChars !== "unlimited" && trimmed.length > limits.maxPromptChars) {
      throw new RateLimitError(
        "PROMPT_TOO_LARGE",
        `This prompt is too large for your current plan. Please keep it under ${limits.maxPromptChars.toLocaleString()} characters or upgrade to Creator.`,
        remaining
      );
    }
  }

  async recordFailure(input: {
    userId: string;
    operation: RateLimitOperation;
    plan?: RateLimitPlan;
    metadata?: JsonObject;
  }) {
    const state = stateFor(input.userId);
    const now = Date.now();
    state.failedTimestamps = prune(state.failedTimestamps, FAILED_REQUEST_WINDOW_MS, now);
    state.failedTimestamps.push(now);

    const plan = input.plan ?? (await quotaCalculator.remainingQuota(input.userId)).plan;
    await rateLimitUsageTracker.trackFailure({
      userId: input.userId,
      plan,
      operation: input.operation,
      metadata: input.metadata
    });

    if (state.failedTimestamps.length > FAILED_REQUEST_LIMIT) {
      state.blockedUntil = now + TEMP_BLOCK_MS;
      await this.logBlocked({
        userId: input.userId,
        plan,
        operation: input.operation,
        reason: "repeated_failed_requests"
      });
    }
  }

  private async detectAbuse(userId: string, plan: RateLimitPlan, operation: RateLimitOperation, quota: QuotaState) {
    if (plan === "admin") return;

    const state = stateFor(userId);
    const now = Date.now();
    if (state.blockedUntil > now) {
      await this.logBlocked({ userId, plan, operation, reason: "temporary_block_active" });
      throw new RateLimitError(
        "TEMPORARILY_BLOCKED",
        "We paused requests for a few minutes because of unusual activity. Please try again shortly.",
        remainingResponse(quota)
      );
    }

    state.requestTimestamps = prune(state.requestTimestamps, REQUEST_BURST_WINDOW_MS, now);
    state.requestTimestamps.push(now);
    if (state.requestTimestamps.length > REQUEST_BURST_LIMIT) {
      state.blockedUntil = now + TEMP_BLOCK_MS;
      await this.logBlocked({ userId, plan, operation, reason: "request_burst" });
      throw new RateLimitError(
        "TEMPORARILY_BLOCKED",
        "We paused requests for a few minutes because of unusually high activity. Please try again shortly.",
        remainingResponse(quota)
      );
    }

    if (operation === "file_upload") {
      state.uploadTimestamps = prune(state.uploadTimestamps, UPLOAD_ABUSE_WINDOW_MS, now);
      state.uploadTimestamps.push(now);
      if (state.uploadTimestamps.length > UPLOAD_ABUSE_LIMIT) {
        state.blockedUntil = now + TEMP_BLOCK_MS;
        await this.logBlocked({ userId, plan, operation, reason: "upload_abuse" });
        throw new RateLimitError(
          "TEMPORARILY_BLOCKED",
          "We paused uploads for a few minutes because of unusual upload activity. Please try again shortly.",
          remainingResponse(quota)
        );
      }
    }

    if (isGenerationOperation(operation)) {
      console.info("[rate-limit] request checked", {
        user_id: userId,
        plan,
        operation,
        label: operationLabel(operation),
        remaining: quota.remaining
      });
    }
  }

  private async logBlocked(input: {
    userId: string;
    plan: RateLimitPlan;
    operation: RateLimitOperation;
    reason: string;
  }) {
    console.warn("[rate-limit] request blocked", {
      user_id: input.userId,
      plan: input.plan,
      operation: input.operation,
      reason: input.reason
    });
    await rateLimitUsageTracker.trackFailure({
      userId: input.userId,
      plan: input.plan,
      operation: input.operation,
      blocked: true,
      metadata: { reason: input.reason }
    });
  }
}

export const rateLimiter = new RateLimiter();
