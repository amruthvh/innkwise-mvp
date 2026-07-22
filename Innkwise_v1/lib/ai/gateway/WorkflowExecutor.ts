import OpenAI from "openai";
import { tokenTracker } from "@/lib/ai/gateway/TokenTracker";
import { GatewayError, LLMTimeoutError } from "@/lib/ai/gateway/GatewayErrors";
import type {
  AIModelProvider,
  AIModelRequest,
  AIModelResponse,
  AIProviderName
} from "@/lib/ai/gateway/GatewayTypes";

const DEFAULT_HF_MODEL = "meta-llama/Llama-3.1-8B-Instruct";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENROUTER_MODEL = "moonshotai/kimi-k2";
const DEFAULT_HF_MAX_TOKENS = 2600;
const DEFAULT_HF_TIMEOUT_MS = 25000;
const DEFAULT_OPENROUTER_MAX_TOKENS = 2600;
const DEFAULT_OPENROUTER_TIMEOUT_MS = 30000;

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseProviderError(status: number, text: string) {
  try {
    const parsed = JSON.parse(text) as {
      error?: string | { message?: string; code?: string };
    };
    const message = typeof parsed.error === "string"
      ? parsed.error
      : parsed.error?.message;
    if (message) {
      return new GatewayError(
        status >= 500 ? "LLM_PROVIDER_UNAVAILABLE" : "LLM_PROVIDER_ERROR",
        message,
        { retryable: status >= 500 || status === 429 }
      );
    }
  } catch {
    // Fall through to HTML/text cleanup.
  }

  const cleaned = stripHtml(text);
  if (status === 504 || /gateway timeout|timeout/i.test(cleaned)) {
    return new LLMTimeoutError("The AI model provider timed out. Please try again in a moment.");
  }

  if (status === 429) {
    return new GatewayError("LLM_RATE_LIMITED", "The AI model provider is rate limited. Please try again shortly.", {
      retryable: true
    });
  }

  if (status >= 500) {
    return new GatewayError("LLM_PROVIDER_UNAVAILABLE", "The AI model provider is temporarily unavailable.", {
      retryable: true
    });
  }

  return new GatewayError(
    "LLM_PROVIDER_ERROR",
    cleaned || "The AI model provider rejected the request.",
    { retryable: false }
  );
}

export class HuggingFaceLlamaProvider implements AIModelProvider {
  readonly name: AIProviderName = "llama";

  async generate(request: AIModelRequest): Promise<AIModelResponse> {
    const token = process.env.HF_API_TOKEN;
    if (!token) {
      throw new Error("HF_API_TOKEN is missing.");
    }

    const model = process.env.HF_MODEL ?? DEFAULT_HF_MODEL;
    const maxTokens = Math.min(
      request.maxTokens ?? DEFAULT_HF_MAX_TOKENS,
      readPositiveInt(process.env.HF_MAX_TOKENS, DEFAULT_HF_MAX_TOKENS)
    );
    const timeoutMs = readPositiveInt(process.env.HF_REQUEST_TIMEOUT_MS, DEFAULT_HF_TIMEOUT_MS);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    let response: Response;

    try {
      response = await fetch("https://router.huggingface.co/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: request.prompt }],
          temperature: request.temperature ?? 0.7,
          max_tokens: maxTokens
        })
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMTimeoutError("The AI model provider timed out. Please try again in a moment.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw parseProviderError(response.status, errorText);
    }

    const data = (await response.json()) as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    const estimated = tokenTracker.estimate(request.prompt, text);

    return {
      text,
      model,
      provider: this.name,
      tokenUsage: {
        promptTokens: data.usage?.prompt_tokens ?? estimated.promptTokens,
        completionTokens: data.usage?.completion_tokens ?? estimated.completionTokens,
        totalTokens: data.usage?.total_tokens ?? estimated.totalTokens
      },
      latencyMs: Date.now() - startedAt
    };
  }
}

export class OpenAIModelProvider implements AIModelProvider {
  readonly name: AIProviderName = "openai";
  private client: OpenAI | null = null;

  private getClient() {
    if (this.client) return this.client;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new GatewayError("OPENAI_NOT_CONFIGURED", "OPENAI_API_KEY is not configured.", {
        retryable: false
      });
    }
    this.client = new OpenAI({ apiKey });
    return this.client;
  }

  async generate(request: AIModelRequest): Promise<AIModelResponse> {
    const model = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
    const startedAt = Date.now();
    const completion = await this.getClient().chat.completions.create({
      model,
      messages: [{ role: "user", content: request.prompt }],
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2200
    });
    const text = completion.choices[0]?.message?.content ?? "";
    const estimated = tokenTracker.estimate(request.prompt, text);

    return {
      text,
      model,
      provider: this.name,
      tokenUsage: {
        promptTokens: completion.usage?.prompt_tokens ?? estimated.promptTokens,
        completionTokens: completion.usage?.completion_tokens ?? estimated.completionTokens,
        totalTokens: completion.usage?.total_tokens ?? estimated.totalTokens
      },
      latencyMs: Date.now() - startedAt
    };
  }
}

export class OpenRouterKimiProvider implements AIModelProvider {
  readonly name: AIProviderName = "openrouter";

  async generate(request: AIModelRequest): Promise<AIModelResponse> {
    const token = process.env.OPENROUTER_API_KEY;
    if (!token) {
      throw new GatewayError("OPENROUTER_NOT_CONFIGURED", "OPENROUTER_API_KEY is not configured.", {
        retryable: false
      });
    }

    const model = process.env.OPENROUTER_MODEL ?? DEFAULT_OPENROUTER_MODEL;
    const maxTokens = Math.min(
      request.maxTokens ?? DEFAULT_OPENROUTER_MAX_TOKENS,
      readPositiveInt(process.env.OPENROUTER_MAX_TOKENS, DEFAULT_OPENROUTER_MAX_TOKENS)
    );
    const timeoutMs = readPositiveInt(process.env.OPENROUTER_REQUEST_TIMEOUT_MS, DEFAULT_OPENROUTER_TIMEOUT_MS);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    const siteUrl = process.env.OPENROUTER_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
    const appName = process.env.OPENROUTER_APP_NAME ?? "Innkwise";
    let response: Response;

    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(siteUrl ? { "HTTP-Referer": siteUrl } : {}),
          ...(appName ? { "X-Title": appName } : {})
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: request.prompt }],
          temperature: request.temperature ?? 0.7,
          max_tokens: maxTokens
        })
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMTimeoutError("The OpenRouter model timed out. Please try again in a moment.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw parseProviderError(response.status, errorText);
    }

    const data = (await response.json()) as {
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    const estimated = tokenTracker.estimate(request.prompt, text);

    return {
      text,
      model,
      provider: this.name,
      tokenUsage: {
        promptTokens: data.usage?.prompt_tokens ?? estimated.promptTokens,
        completionTokens: data.usage?.completion_tokens ?? estimated.completionTokens,
        totalTokens: data.usage?.total_tokens ?? estimated.totalTokens
      },
      latencyMs: Date.now() - startedAt
    };
  }
}

export class FallbackModelProvider implements AIModelProvider {
  readonly name: AIProviderName = "llama";

  constructor(
    private readonly primary: AIModelProvider = new HuggingFaceLlamaProvider(),
    private readonly fallback: AIModelProvider = new OpenAIModelProvider()
  ) {}

  async generate(request: AIModelRequest): Promise<AIModelResponse> {
    try {
      return await this.primary.generate(request);
    } catch (error) {
      if (!process.env.OPENAI_API_KEY) {
        throw error;
      }

      console.warn("[ai-gateway] primary model failed; using fallback provider", {
        primary: this.primary.name,
        fallback: this.fallback.name,
        code: error instanceof GatewayError ? error.code : "UNKNOWN",
        message: error instanceof Error ? error.message : "Unknown provider error"
      });

      return this.fallback.generate(request);
    }
  }
}

export class WorkflowExecutor {
  constructor(private readonly provider: AIModelProvider = createDefaultProvider()) {}

  execute(request: AIModelRequest) {
    return this.provider.generate(request);
  }
}

function createDefaultProvider(): AIModelProvider {
  const primaryProvider = process.env.AI_PRIMARY_PROVIDER?.toLowerCase();

  if (primaryProvider === "openrouter") {
    return new OpenRouterKimiProvider();
  }

  if (primaryProvider === "openai") {
    return new OpenAIModelProvider();
  }

  return new FallbackModelProvider();
}
