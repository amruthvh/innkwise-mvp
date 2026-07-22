import { addMessage, createConversation, ensureProfileForAppUser, touchConversation } from "@/backend/creator-os/crud-service";
import { toCreatorUserId } from "@/backend/auth/identifiers";
import { outputValidator } from "@/lib/ai/gateway/OutputValidator";
import { promptGuard } from "@/lib/ai/gateway/PromptGuard";
import { RequestPipeline } from "@/lib/ai/gateway/RequestPipeline";
import { retryManager } from "@/lib/ai/gateway/RetryManager";
import { WorkflowExecutor } from "@/lib/ai/gateway/WorkflowExecutor";
import { GatewayError, PromptRejectedError, RateLimitError } from "@/lib/ai/gateway/GatewayErrors";
import { rateLimiter } from "@/lib/rate-limit/RateLimiter";
import { isRateLimitError } from "@/lib/rate-limit/RateLimitErrors";
import type { RateLimitOperation } from "@/lib/rate-limit/PlanLimits";
import { inputValidator } from "@/lib/validation/InputValidator";
import { isInputValidationError } from "@/lib/validation/ValidationErrors";
import { tokenBudgetEngine } from "@/lib/context/token-budget-engine";
import type {
  AIGatewayExecuteInput,
  AIModelProvider,
  AIResponse,
  GatewayResult,
  PreparedGatewayInput
} from "@/lib/ai/gateway/GatewayTypes";
import type { JsonObject } from "@/shared/types/creator-os";

function titleFromPrompt(prompt: string) {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";
  return cleaned.length > 72 ? `${cleaned.slice(0, 69).trim()}...` : cleaned;
}

function operationForWorkflow(workflowType: AIGatewayExecuteInput["workflowType"]): RateLimitOperation {
  if (workflowType === "research") return "research_generation";
  if (workflowType === "strategy") return "strategy_generation";
  if (workflowType === "script") return "script_generation";
  if (workflowType === "production") return "production_generation";
  if (workflowType === "distribution") return "posting_generation";
  return "chat_generation";
}

function resolveGatewayMaxTokens(input: {
  workflowType: AIGatewayExecuteInput["workflowType"];
  maxTokens?: number;
  metadata?: JsonObject;
}) {
  return input.maxTokens ?? tokenBudgetEngine.getOutputTokenBudget({
    workflow: input.workflowType,
    workflowId: typeof input.metadata?.workflowId === "string" ? input.metadata.workflowId : null,
    videoType: typeof input.metadata?.videoType === "string" ? input.metadata.videoType : null,
    length: typeof input.metadata?.length === "number" ? input.metadata.length : null,
    metadata: input.metadata
  });
}

function logGatewayEvent(event: string, data: Record<string, unknown>) {
  console.info(`[ai-gateway] ${event}`, data);
}

export class AIGateway {
  private readonly pipeline = new RequestPipeline();
  private readonly executor: WorkflowExecutor;

  constructor(provider?: AIModelProvider) {
    this.executor = new WorkflowExecutor(provider);
  }

  async execute(input: AIGatewayExecuteInput): Promise<GatewayResult> {
    const startedAt = Date.now();
    try {
      const authUserId = input.userId;
      input = {
        ...input,
        userId: toCreatorUserId(input.userId),
        metadata: {
          authUserId,
          ...(input.metadata ?? {})
        }
      };
      const validated = await inputValidator.validateChatRequest(input.userId, {
        prompt: input.prompt,
        workflowType: input.workflowType,
        conversationId: input.conversationId,
        attachments: input.attachments
      });
      input = {
        ...input,
        prompt: validated.prompt,
        workflowType: validated.workflowType,
        conversationId: validated.conversationId,
        attachments: validated.attachments
      };
      const operation = input.operation ?? operationForWorkflow(input.workflowType);
      await rateLimiter.checkQuota({
        userId: input.userId,
        operation,
        prompt: input.prompt
      });
      promptGuard.assertSafe(input.prompt);
      await ensureProfileForAppUser({ id: input.userId });

      const conversationId = input.conversationId || (await createConversation({
        userId: input.userId,
        title: titleFromPrompt(input.prompt),
        contextSnapshot: {
          workflow: input.workflowType,
          initialPrompt: input.prompt
        },
        memoryState: {},
        metadata: {
          source: "ai-gateway",
          ...(input.metadata ?? {})
        }
      })).id;

      await addMessage({
        userId: input.userId,
        conversationId,
        role: "user",
        content: input.prompt,
        contentJson: {},
        metadata: {
          workflow: input.workflowType,
          ...(input.metadata ?? {})
        }
      });

      const prepared = await this.pipeline.prepare({
        ...input,
        conversationId
      });

      const response = await this.executePrepared({
        userId: input.userId,
        conversationId,
        workflowType: prepared.workflow,
        prompt: input.prompt,
        finalPrompt: prepared.finalPrompt,
        context: prepared.context,
        llmPrompt: prepared.llmPrompt,
        metadata: input.metadata,
        responseInstructions: input.responseInstructions,
        operation,
        rateLimitChecked: true,
        maxTokens: input.maxTokens,
        temperature: input.temperature
      });

      await addMessage({
        userId: input.userId,
        conversationId,
        role: "assistant",
        content: response.content,
        contentJson: {
          type: "gateway",
          workflowType: response.workflowType,
          tokenUsage: response.tokenUsage,
          validation: response.validation
        } as unknown as JsonObject,
        tokenCount: response.tokenUsage.totalTokens,
        metadata: response.metadata
      });
      await touchConversation(input.userId, conversationId);

      return response;
    } catch (error) {
      if (error instanceof PromptRejectedError) {
        return {
          success: false,
          code: "PROMPT_REJECTED",
          message: error.message,
          workflowType: input.workflowType,
          conversationId: input.conversationId ?? null
        };
      }
      if (error instanceof RateLimitError) {
        return {
          success: false,
          code: "RATE_LIMITED",
          message: error.message,
          workflowType: input.workflowType,
          conversationId: input.conversationId ?? null
        };
      }
      if (isRateLimitError(error)) {
        return {
          success: false,
          code: error.code,
          message: error.message,
          workflowType: input.workflowType,
          conversationId: input.conversationId ?? null,
          metadata: error.toResponse() as unknown as JsonObject
        };
      }
      if (isInputValidationError(error)) {
        return {
          success: false,
          code: "GATEWAY_ERROR",
          message: error.message,
          workflowType: input.workflowType,
          conversationId: input.conversationId ?? null,
          metadata: error.toResponse() as unknown as JsonObject
        };
      }

      logGatewayEvent("failed", {
        workflow: input.workflowType,
        user: input.userId,
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown error"
      });

      return {
        success: false,
        code: "GATEWAY_ERROR",
        message: error instanceof GatewayError ? error.message : "Unable to generate a response.",
        workflowType: input.workflowType,
        conversationId: input.conversationId ?? null
      };
    }
  }

  async executePrepared(input: PreparedGatewayInput): Promise<AIResponse> {
    const startedAt = Date.now();
    const timing = input.timing;
    const operation = input.operation ?? operationForWorkflow(input.workflowType);
    try {
      const authUserId = input.userId;
      input = {
        ...input,
        userId: toCreatorUserId(input.userId),
        metadata: {
          authUserId,
          ...(input.metadata ?? {})
        }
      };
      const validated = await (timing
        ? timing.time("gateway.validate_input", () => inputValidator.validateChatRequest(input.userId, {
          prompt: input.prompt,
          workflowType: input.workflowType,
          conversationId: input.conversationId,
          attachments: []
        }))
        : inputValidator.validateChatRequest(input.userId, {
          prompt: input.prompt,
          workflowType: input.workflowType,
          conversationId: input.conversationId,
          attachments: []
        }));
      input = {
        ...input,
        prompt: validated.prompt,
        workflowType: validated.workflowType,
        conversationId: validated.conversationId ?? input.conversationId
      };
      if (!input.rateLimitChecked) {
        await (timing
          ? timing.time("gateway.rate_limit_check", () => rateLimiter.checkQuota({
            userId: input.userId,
            operation,
            prompt: input.prompt
          }), { operation })
          : rateLimiter.checkQuota({
            userId: input.userId,
            operation,
            prompt: input.prompt
          }));
      }
      if (input.rateLimitChecked) {
        timing?.mark("gateway.rate_limit_check_skipped", { operation });
      }
      if (timing) {
        timing.timeSync("gateway.prompt_guard", () => promptGuard.assertSafe(input.prompt));
      } else {
        promptGuard.assertSafe(input.prompt);
      }
      const skipOutputValidation = input.metadata?.gatewaySkipOutputValidation === true;
      const maxTokens = resolveGatewayMaxTokens(input);
      let providerAttempt = 0;

      const result = await (timing
        ? timing.time("gateway.llm_generation_with_validation", () => retryManager.run({
          provider: {
            name: "llama",
            generate: (request) => {
              providerAttempt += 1;
              return timing.time("gateway.llm_provider_attempt", () => this.executor.execute(request), {
                attempt: providerAttempt,
                workflow: request.workflowType,
                maxTokens: request.maxTokens ?? null
              });
            }
          },
          request: {
            prompt: input.finalPrompt,
            workflowType: input.workflowType,
            maxTokens,
            temperature: input.temperature
          },
          shouldRetry: (response, retryCount) => {
            timing.mark("gateway.output_validation", {
              retryCount,
              providerLatencyMs: response.latencyMs,
              completionTokens: response.tokenUsage.completionTokens
            });
            if (skipOutputValidation) {
              return { shouldRetry: false };
            }
            const validation = outputValidator.validate(input.workflowType, response.text);
            return {
              shouldRetry: validation.retryable && !validation.valid,
              reason: validation.reason
            };
          },
          buildRetryPrompt: (response, decision) => [
            input.finalPrompt,
            "",
            "The previous response was incomplete.",
            decision.reason ? `Issue: ${decision.reason}` : "",
            "Regenerate the answer and include all required user-facing sections. Do not mention this retry."
          ].filter(Boolean).join("\n")
        }), {
          workflow: input.workflowType,
          maxTokens
        })
        : retryManager.run({
        provider: {
          name: "llama",
          generate: (request) => this.executor.execute(request)
        },
        request: {
          prompt: input.finalPrompt,
          workflowType: input.workflowType,
          maxTokens,
          temperature: input.temperature
        },
        shouldRetry: (response) => {
          if (skipOutputValidation) {
            return { shouldRetry: false };
          }
          const validation = outputValidator.validate(input.workflowType, response.text);
          return {
            shouldRetry: validation.retryable && !validation.valid,
            reason: validation.reason
          };
        },
        buildRetryPrompt: (response, decision) => [
          input.finalPrompt,
          "",
          "The previous response was incomplete.",
          decision.reason ? `Issue: ${decision.reason}` : "",
          "Regenerate the answer and include all required user-facing sections. Do not mention this retry."
        ].filter(Boolean).join("\n")
      }));

      const modelResponse = result.response;
      const validation = skipOutputValidation
        ? { valid: true, missingSections: [], retryable: false }
        : outputValidator.validate(input.workflowType, modelResponse.text);
      const latencyMs = Date.now() - startedAt;
      const metadata = {
        ...(input.metadata ?? {}),
        gateway: {
          version: "ai-gateway-v1",
          retryCount: result.retryCount,
          validation,
          provider: modelResponse.provider,
          model: modelResponse.model
        }
      } as JsonObject;

      await (timing
        ? timing.time("gateway.consume_quota", () => rateLimiter.consumeQuota({
          userId: input.userId,
          operation,
          latencyMs,
          tokenUsage: modelResponse.tokenUsage
        }), { operation })
        : rateLimiter.consumeQuota({
          userId: input.userId,
          operation,
          latencyMs,
          tokenUsage: modelResponse.tokenUsage
        }));

      logGatewayEvent("completed", {
        workflow: input.workflowType,
        user: input.userId,
        model: modelResponse.model,
        latencyMs,
        retryCount: result.retryCount,
        success: validation.valid
      });

      return {
        success: true,
        content: modelResponse.text,
        rawText: modelResponse.text,
        workflowType: input.workflowType,
        conversationId: input.conversationId,
        provider: modelResponse.provider,
        model: modelResponse.model,
        tokenUsage: modelResponse.tokenUsage,
        latencyMs,
        retryCount: result.retryCount,
        validation,
        metadata
      };
    } catch (error) {
      if (!isRateLimitError(error)) {
        await rateLimiter.recordFailure({
          userId: input.userId,
          operation,
          metadata: {
            workflow: input.workflowType,
            error: error instanceof Error ? error.message : "Unknown error"
          }
        });
      }
      throw error;
    }
  }
}

export const aiGateway = new AIGateway();
