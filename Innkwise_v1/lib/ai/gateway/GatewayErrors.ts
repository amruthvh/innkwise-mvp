export class GatewayError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, options: { retryable?: boolean } = {}) {
    super(message);
    this.name = "GatewayError";
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

export class PromptRejectedError extends GatewayError {
  constructor(message = "I cannot help with requests that try to bypass safety or reveal hidden system instructions.") {
    super("PROMPT_REJECTED", message, { retryable: false });
  }
}

export class RateLimitError extends GatewayError {
  constructor(message = "You are sending requests too quickly. Please wait a moment and try again.") {
    super("RATE_LIMITED", message, { retryable: false });
  }
}

export class LLMTimeoutError extends GatewayError {
  constructor(message = "The AI model timed out before completing the response.") {
    super("LLM_TIMEOUT", message, { retryable: true });
  }
}

export class OutputValidationError extends GatewayError {
  readonly missingSections: string[];

  constructor(missingSections: string[], message = "The AI response was incomplete.") {
    super("OUTPUT_VALIDATION_FAILED", message, { retryable: true });
    this.missingSections = missingSections;
  }
}
