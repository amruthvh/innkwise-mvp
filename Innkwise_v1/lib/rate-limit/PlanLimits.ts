export type RateLimitPlan = "free" | "pro" | "admin";

export type RateLimitOperation =
  | "chat_generation"
  | "research_generation"
  | "strategy_generation"
  | "script_generation"
  | "production_generation"
  | "posting_generation"
  | "embedding_generation"
  | "file_upload"
  | "future_channel_analysis";

export type PlanLimitConfig = {
  aiGenerationsPerDay: number | "unlimited";
  embeddingsPerDay: number | "unlimited";
  uploadsPerDay: number | "unlimited";
  maxPromptChars: number | "unlimited";
};

const DEFAULT_LIMITS: Record<RateLimitPlan, PlanLimitConfig> = {
  free: {
    aiGenerationsPerDay: 20,
    embeddingsPerDay: 10,
    uploadsPerDay: 5,
    maxPromptChars: 10_000
  },
  pro: {
    aiGenerationsPerDay: 500,
    embeddingsPerDay: 500,
    uploadsPerDay: 100,
    maxPromptChars: 50_000
  },
  admin: {
    aiGenerationsPerDay: "unlimited",
    embeddingsPerDay: "unlimited",
    uploadsPerDay: "unlimited",
    maxPromptChars: "unlimited"
  }
};

function readNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getPlanLimits(plan: RateLimitPlan): PlanLimitConfig {
  if (plan === "admin") return DEFAULT_LIMITS.admin;
  if (plan === "pro") {
    return {
      aiGenerationsPerDay: readNumber("RATE_LIMIT_PRO_AI_GENERATIONS_PER_DAY", DEFAULT_LIMITS.pro.aiGenerationsPerDay as number),
      embeddingsPerDay: readNumber("RATE_LIMIT_PRO_EMBEDDINGS_PER_DAY", DEFAULT_LIMITS.pro.embeddingsPerDay as number),
      uploadsPerDay: readNumber("RATE_LIMIT_PRO_UPLOADS_PER_DAY", DEFAULT_LIMITS.pro.uploadsPerDay as number),
      maxPromptChars: readNumber("RATE_LIMIT_PRO_MAX_PROMPT_CHARS", DEFAULT_LIMITS.pro.maxPromptChars as number)
    };
  }

  return {
    aiGenerationsPerDay: readNumber("RATE_LIMIT_FREE_AI_GENERATIONS_PER_DAY", DEFAULT_LIMITS.free.aiGenerationsPerDay as number),
    embeddingsPerDay: readNumber("RATE_LIMIT_FREE_EMBEDDINGS_PER_DAY", DEFAULT_LIMITS.free.embeddingsPerDay as number),
    uploadsPerDay: readNumber("RATE_LIMIT_FREE_UPLOADS_PER_DAY", DEFAULT_LIMITS.free.uploadsPerDay as number),
    maxPromptChars: readNumber("RATE_LIMIT_FREE_MAX_PROMPT_CHARS", DEFAULT_LIMITS.free.maxPromptChars as number)
  };
}

export function isGenerationOperation(operation: RateLimitOperation) {
  return operation.endsWith("_generation") || operation === "future_channel_analysis";
}

export function operationLabel(operation: RateLimitOperation) {
  if (operation === "embedding_generation") return "embedding";
  if (operation === "file_upload") return "upload";
  return "AI generation";
}
