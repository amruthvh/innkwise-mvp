import { tokenTracker } from "@/lib/ai/gateway/TokenTracker";
import type {
  AIModelProvider,
  AIModelRequest,
  AIModelResponse,
  AIProviderName
} from "@/lib/ai/gateway/GatewayTypes";

export class HuggingFaceLlamaProvider implements AIModelProvider {
  readonly name: AIProviderName = "llama";

  async generate(request: AIModelRequest): Promise<AIModelResponse> {
    const token = process.env.HF_API_TOKEN;
    if (!token) {
      throw new Error("HF_API_TOKEN is missing.");
    }

    const model = process.env.HF_MODEL ?? "meta-llama/Llama-3.1-8B-Instruct";
    const startedAt = Date.now();
    const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: request.prompt }],
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens ?? 2200
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Llama request failed.");
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

export class WorkflowExecutor {
  constructor(private readonly provider: AIModelProvider = new HuggingFaceLlamaProvider()) {}

  execute(request: AIModelRequest) {
    return this.provider.generate(request);
  }
}
