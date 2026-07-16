import type { AIModelProvider, AIModelRequest, AIModelResponse } from "@/lib/ai/gateway/GatewayTypes";
import { GatewayError } from "@/lib/ai/gateway/GatewayErrors";

export type RetryDecision = {
  shouldRetry: boolean;
  reason?: string;
};

export class RetryManager {
  constructor(private readonly maxRetries = 1) {}

  async run(input: {
    provider: AIModelProvider;
    request: AIModelRequest;
    shouldRetry: (response: AIModelResponse, retryCount: number) => RetryDecision;
    buildRetryPrompt: (response: AIModelResponse, decision: RetryDecision) => string;
  }) {
    let retryCount = 0;
    let request = input.request;
    let response: AIModelResponse;

    try {
      response = await input.provider.generate(request);
    } catch (error) {
      if (!(error instanceof GatewayError) || !error.retryable || retryCount >= this.maxRetries) {
        throw error;
      }

      retryCount += 1;
      response = await input.provider.generate(request);
    }

    let decision = input.shouldRetry(response, retryCount);

    while (decision.shouldRetry && retryCount < this.maxRetries) {
      retryCount += 1;
      request = {
        ...request,
        prompt: input.buildRetryPrompt(response, decision)
      };
      response = await input.provider.generate(request);
      decision = input.shouldRetry(response, retryCount);
    }

    return {
      response,
      retryCount,
      finalDecision: decision
    };
  }
}

export const retryManager = new RetryManager(1);
