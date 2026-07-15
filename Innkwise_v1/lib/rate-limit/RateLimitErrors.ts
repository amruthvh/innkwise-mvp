export type RateLimitErrorCode =
  | "RATE_LIMIT_EXCEEDED"
  | "PROMPT_TOO_LARGE"
  | "EMPTY_PROMPT"
  | "TEMPORARILY_BLOCKED";

export type RemainingQuota = {
  generations: number | "unlimited";
  embeddings: number | "unlimited";
  uploads: number | "unlimited";
};

export class RateLimitError extends Error {
  readonly code: RateLimitErrorCode;
  readonly remaining: RemainingQuota;

  constructor(code: RateLimitErrorCode, message: string, remaining: RemainingQuota) {
    super(message);
    this.name = "RateLimitError";
    this.code = code;
    this.remaining = remaining;
  }

  toResponse() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message
      },
      remaining: this.remaining
    };
  }
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}
