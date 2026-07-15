import type { TokenUsage } from "@/lib/ai/gateway/GatewayTypes";

const APPROX_CHARS_PER_TOKEN = 4;

function estimateTokens(text: string) {
  if (!text.trim()) return 0;
  return Math.max(1, Math.ceil(text.length / APPROX_CHARS_PER_TOKEN));
}

export class TokenTracker {
  estimate(prompt: string, completion: string): TokenUsage {
    const promptTokens = estimateTokens(prompt);
    const completionTokens = estimateTokens(completion);
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    };
  }
}

export const tokenTracker = new TokenTracker();
