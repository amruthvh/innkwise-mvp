import { getPlanLimits, type RateLimitPlan } from "@/lib/rate-limit/PlanLimits";
import { sanitizer } from "@/lib/validation/Sanitizer";
import { InputValidationError } from "@/lib/validation/ValidationErrors";

const REPEATED_CHAR_PATTERN = /(.)\1{29,}/u;

function hasRepeatedLines(prompt: string) {
  const lines = prompt
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 8);
  const counts = new Map<string, number>();
  for (const line of lines) {
    const count = (counts.get(line) ?? 0) + 1;
    if (count >= 4) return true;
    counts.set(line, count);
  }
  return false;
}

function hasRepeatedWords(prompt: string) {
  const words = prompt.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length < 12) return false;
  let streak = 1;
  for (let index = 1; index < words.length; index += 1) {
    streak = words[index] === words[index - 1] ? streak + 1 : 1;
    if (streak >= 10) return true;
  }
  return false;
}

export class PromptValidator {
  validate(prompt: unknown, plan: RateLimitPlan) {
    const sanitized = sanitizer.sanitizeText(prompt);
    const value = sanitized.value;

    if (!value) {
      throw new InputValidationError("INVALID_PROMPT", "Please enter a prompt before generating.");
    }

    if (value.length < 3) {
      throw new InputValidationError("INVALID_PROMPT", "Please make your prompt at least 3 characters long.");
    }

    const limits = getPlanLimits(plan);
    if (limits.maxPromptChars !== "unlimited" && value.length > limits.maxPromptChars) {
      throw new InputValidationError(
        "INVALID_PROMPT",
        "Your prompt is too long. Please shorten it or upload it as a document."
      );
    }

    if (sanitized.removedInvisibleChars > 20) {
      throw new InputValidationError("INVALID_PROMPT", "Your prompt contains too many invisible characters.");
    }

    if (REPEATED_CHAR_PATTERN.test(value) || hasRepeatedLines(value) || hasRepeatedWords(value)) {
      throw new InputValidationError("INVALID_PROMPT", "Your prompt looks repetitive. Please rewrite it with a clearer request.");
    }

    return value;
  }
}

export const promptValidator = new PromptValidator();
