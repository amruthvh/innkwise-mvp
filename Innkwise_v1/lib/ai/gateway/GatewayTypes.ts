import type { ContextAssembly, ContextWorkflow } from "@/backend/context/context-engine";
import type { LlmReadyPrompt } from "@/backend/context/prompt-builder";
import type { TimingTracker } from "@/lib/observability/timing";
import type { RateLimitOperation } from "@/lib/rate-limit/PlanLimits";
import type { GeneratedAssetType, JsonObject } from "@/shared/types/creator-os";

export type AIProviderName = "llama" | "openai" | "openrouter" | "claude" | "gemini" | "deepseek";

export type GatewayAttachment = {
  id?: string;
  name?: string;
  mimeType?: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

export type AIGatewayExecuteInput = {
  userId: string;
  conversationId?: string | null;
  workflowType: ContextWorkflow;
  prompt: string;
  attachments?: GatewayAttachment[];
  requestedAssetType?: GeneratedAssetType;
  selectedKnowledgeSourceIds?: string[];
  metadata?: JsonObject;
  responseInstructions?: string;
  operation?: RateLimitOperation;
  rateLimitChecked?: boolean;
  maxTokens?: number;
  temperature?: number;
  timing?: TimingTracker;
};

export type PreparedGatewayInput = {
  userId: string;
  conversationId: string;
  workflowType: ContextWorkflow;
  prompt: string;
  finalPrompt: string;
  context?: ContextAssembly;
  llmPrompt?: LlmReadyPrompt;
  metadata?: JsonObject;
  responseInstructions?: string;
  operation?: RateLimitOperation;
  rateLimitChecked?: boolean;
  maxTokens?: number;
  temperature?: number;
  timing?: TimingTracker;
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type AIModelRequest = {
  prompt: string;
  workflowType: ContextWorkflow;
  maxTokens?: number;
  temperature?: number;
};

export type AIModelResponse = {
  text: string;
  model: string;
  provider: AIProviderName;
  tokenUsage: TokenUsage;
  latencyMs: number;
};

export type AIModelProvider = {
  readonly name: AIProviderName;
  generate(request: AIModelRequest): Promise<AIModelResponse>;
};

export type OutputValidationResult = {
  valid: boolean;
  missingSections: string[];
  reason?: string;
  retryable: boolean;
};

export type AIResponse = {
  success: true;
  content: string;
  rawText: string;
  workflowType: ContextWorkflow;
  conversationId: string | null;
  provider: AIProviderName;
  model: string;
  tokenUsage: TokenUsage;
  latencyMs: number;
  retryCount: number;
  validation: OutputValidationResult;
  metadata: JsonObject;
};

export type AISafetyRejection = {
  success: false;
  code:
    | "PROMPT_REJECTED"
    | "RATE_LIMITED"
    | "RATE_LIMIT_EXCEEDED"
    | "PROMPT_TOO_LARGE"
    | "EMPTY_PROMPT"
    | "TEMPORARILY_BLOCKED"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "GATEWAY_ERROR";
  message: string;
  workflowType: ContextWorkflow;
  conversationId: string | null;
  metadata?: JsonObject;
};

export type GatewayResult = AIResponse | AISafetyRejection;
