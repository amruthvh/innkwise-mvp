import { PromptRejectedError } from "@/lib/ai/gateway/GatewayErrors";

export type PromptGuardResult = {
  safe: boolean;
  reasons: string[];
};

const suspiciousPatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bignore (all )?(previous|prior|above) (instructions|rules|system)\b/i, reason: "instruction override attempt" },
  { pattern: /\b(system prompt|developer prompt|hidden prompt|initial instructions)\b/i, reason: "hidden prompt extraction attempt" },
  { pattern: /\b(jailbreak|do anything now|DAN mode|bypass safety|bypass guardrails)\b/i, reason: "jailbreak attempt" },
  { pattern: /\breveal (your )?(policy|chain of thought|hidden instructions|system message)\b/i, reason: "private instruction extraction attempt" },
  { pattern: /<\s*system\s*>|<\s*developer\s*>|\[\s*system\s*\]/i, reason: "role injection marker" }
];

export class PromptGuard {
  inspect(prompt: string): PromptGuardResult {
    const reasons = suspiciousPatterns
      .filter((entry) => entry.pattern.test(prompt))
      .map((entry) => entry.reason);

    return {
      safe: reasons.length === 0,
      reasons
    };
  }

  assertSafe(prompt: string) {
    const result = this.inspect(prompt);
    if (!result.safe) {
      throw new PromptRejectedError();
    }
    return result;
  }
}

export const promptGuard = new PromptGuard();
