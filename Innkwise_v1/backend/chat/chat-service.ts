import type { NextApiRequest } from "next";
import {
  buildContextAssembly,
  fetchCreatorProfile,
  type ContextAssembly,
  type ContextWorkflow
} from "@/backend/context/context-engine";
import { PromptBuilder, type LlmReadyPrompt } from "@/backend/context/prompt-builder";
import {
  addMessage,
  createConversation,
  ensureProfileForAppUser,
  getConversationState,
  touchConversation,
  updateConversationState
} from "@/backend/creator-os/crud-service";
import { memoryManager, type MemoryDetectionResult } from "@/backend/memory/memory-manager";
import {
  buildClarificationResponse,
  createPendingWorkflowState,
  evaluateContextCompleteness,
  generateClarificationQuestions,
  isPendingWorkflowState,
  type ContextCompletenessResult,
  type PendingWorkflowState
} from "@/lib/clarification/clarification-engine";
import { getAuthenticatedUser } from "@/lib/auth/auth";
import { toCreatorUserId } from "@/backend/auth/identifiers";
import { aiGateway } from "@/lib/ai/gateway/AIGateway";
import { contextResolver } from "@/lib/context/context-resolver";
import { tokenBudgetEngine } from "@/lib/context/token-budget-engine";
import type { TimingTracker } from "@/lib/observability/timing";
import { inputValidator } from "@/lib/validation/InputValidator";
import type { GeneratedAssetType, JsonObject, Message } from "@/shared/types/creator-os";

type ChatServiceTurnBase = {
  userId: string;
  conversationId: string;
  userMessage: Message;
  memoryDetection: MemoryDetectionResult;
};

export type ChatServiceReadyTurn = ChatServiceTurnBase & {
  kind: "ready";
  workflow: ContextWorkflow;
  context: ContextAssembly;
  llmPrompt: LlmReadyPrompt;
  finalPrompt: string;
};

export type ChatServiceClarificationTurn = ChatServiceTurnBase & {
  kind: "clarification";
  workflow: ContextWorkflow;
  clarification: {
    response: string;
    evaluation: ContextCompletenessResult;
    pendingWorkflow: PendingWorkflowState;
  };
};

export type ChatServiceTurn = ChatServiceReadyTurn | ChatServiceClarificationTurn;

export type ChatServiceGenerateResult =
  | (ChatServiceReadyTurn & {
    rawText: string;
  })
  | (ChatServiceClarificationTurn & {
    rawText: string;
  });

export type ChatServiceCompletion = ChatServiceReadyTurn & {
  rawText: string;
};

export type StartChatTurnInput = {
  req: NextApiRequest;
  message: string;
  workflow: ContextWorkflow;
  conversationId?: string | null;
  requestedAssetType?: GeneratedAssetType;
  metadata?: JsonObject;
  responseInstructions?: string;
  selectedKnowledgeSourceIds?: string[];
  timing?: TimingTracker;
};

export type FinishChatTurnInput = {
  userId: string;
  conversationId: string;
  assistantContent: string;
  assistantJson?: JsonObject;
  metadata?: JsonObject;
};

export type GenerateChatCompletionInput = StartChatTurnInput & {
  maxTokens?: number;
  temperature?: number;
};

function conversationTitle(message: string) {
  const cleaned = message
    .replace(/^(research this topic for a creator audience|plan a content strategy around|generate a script about|create a production kit for|build a posting strategy for)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const title = cleaned || message.trim() || "New conversation";
  return title.length > 72 ? `${title.slice(0, 69).trim()}...` : title;
}

function buildFinalPrompt(llmPrompt: LlmReadyPrompt, responseInstructions?: string) {
  return [
    llmPrompt.systemPrompt,
    "",
    llmPrompt.contextPrompt,
    "",
    responseInstructions?.trim()
      ? ["## Response Instructions", responseInstructions.trim()].join("\n")
      : "",
    "",
    llmPrompt.userPrompt
  ].filter(Boolean).join("\n\n");
}

export class ChatService {
  async startTurn(input: StartChatTurnInput): Promise<ChatServiceTurn> {
    const timing = input.timing;
    const authUser = await (timing
      ? timing.time("chat.authenticate", () => getAuthenticatedUser(input.req))
      : getAuthenticatedUser(input.req));
    const authUserId = authUser.id;
    const userId = toCreatorUserId(authUser.id);
    const validatedInput = await (timing
      ? timing.time("chat.validate_input", () => inputValidator.validateChatRequest(userId, {
        prompt: input.message,
        workflowType: input.workflow,
        conversationId: input.conversationId,
        attachments: []
      }))
      : inputValidator.validateChatRequest(userId, {
        prompt: input.message,
        workflowType: input.workflow,
        conversationId: input.conversationId,
        attachments: []
      }));
    const message = validatedInput.prompt;
    const requestedWorkflow = validatedInput.workflowType;
    const requestedConversationId = validatedInput.conversationId;

    await (timing
      ? timing.time("chat.ensure_profile", () => ensureProfileForAppUser({
        id: userId,
        email: authUser.email
      }))
      : ensureProfileForAppUser({
        id: userId,
        email: authUser.email
      }));

    const conversationId = requestedConversationId || (await (timing
      ? timing.time("chat.create_conversation", () => createConversation({
        userId,
        title: conversationTitle(message),
        contextSnapshot: {
          workflow: requestedWorkflow,
          initialPrompt: message
        },
        memoryState: {},
        metadata: {
          source: "dashboard-chat",
          authUserId,
          ...(input.metadata ?? {})
        }
      }))
      : createConversation({
        userId,
        title: conversationTitle(message),
        contextSnapshot: {
          workflow: requestedWorkflow,
          initialPrompt: message
        },
        memoryState: {},
        metadata: {
          source: "dashboard-chat",
          authUserId,
          ...(input.metadata ?? {})
        }
      }))).id;

    const userMessage = await (timing
      ? timing.time("chat.save_user_message", () => addMessage({
        userId,
        conversationId,
        role: "user",
        content: message,
        contentJson: {},
        metadata: {
          workflow: requestedWorkflow,
          authUserId,
          ...(input.metadata ?? {})
        }
      }))
      : addMessage({
        userId,
        conversationId,
        role: "user",
        content: message,
        contentJson: {},
        metadata: {
          workflow: requestedWorkflow,
          authUserId,
          ...(input.metadata ?? {})
        }
      }));

    await (timing
      ? timing.time("chat.touch_after_user_message", () => touchConversation(userId, conversationId))
      : touchConversation(userId, conversationId));
    const memoryDetection = await (timing
      ? timing.time("chat.memory_detection", () => memoryManager.detectAndStore({
        userId,
        message
      }))
      : memoryManager.detectAndStore({
        userId,
        message
      }));
    const conversationState = await (timing
      ? timing.time("chat.load_conversation_state", () => getConversationState(userId, conversationId))
      : getConversationState(userId, conversationId));
    const pendingValue = conversationState?.memoryState.pendingWorkflow;
    const pendingWorkflow = isPendingWorkflowState(pendingValue) ? pendingValue : null;
    const workflow = pendingWorkflow?.workflow ?? requestedWorkflow;
    const creatorProfile = await (timing
      ? timing.time("chat.fetch_creator_profile", () => fetchCreatorProfile(userId))
      : fetchCreatorProfile(userId));
    const combinedMessage = pendingWorkflow
      ? `${pendingWorkflow.originalMessage}\n\nAdditional context from the user:\n${message}`
      : message;
    const resolvedContext = await (timing
      ? timing.time("chat.resolve_context", () => contextResolver.resolve({
        userId,
        conversationId,
        workflow,
        workflowId: typeof input.metadata?.workflowId === "string" ? input.metadata.workflowId : null,
        message,
        creatorProfile,
        pendingWorkflow,
        metadata: input.metadata
      }))
      : contextResolver.resolve({
        userId,
        conversationId,
        workflow,
        workflowId: typeof input.metadata?.workflowId === "string" ? input.metadata.workflowId : null,
        message,
        creatorProfile,
        pendingWorkflow,
        metadata: input.metadata
      }));
    const evaluation = timing
      ? timing.timeSync("chat.evaluate_clarification", () => evaluateContextCompleteness({
        workflow,
        message,
        creatorProfile,
        metadata: input.metadata,
        pendingContext: resolvedContext.context
      }))
      : evaluateContextCompleteness({
        workflow,
        message,
        creatorProfile,
        metadata: input.metadata,
        pendingContext: resolvedContext.context
      });

    if (evaluation.shouldAskQuestions) {
      const nextPendingWorkflow = pendingWorkflow
        ? {
          ...pendingWorkflow,
          collectedContext: evaluation.availableContext,
          missingFields: evaluation.missingFields,
          questions: generateClarificationQuestions(evaluation.missingFields),
          updatedAt: new Date().toISOString()
        }
        : createPendingWorkflowState({
          workflow,
          originalMessage: message,
          evaluation
        });
      await (timing
        ? timing.time("chat.save_pending_workflow", () => updateConversationState({
          userId,
          conversationId,
          memoryState: {
            pendingWorkflow: nextPendingWorkflow as unknown as JsonObject
          },
          metadata: {
            clarificationStatus: "pending",
            completenessScore: evaluation.completenessScore
          }
        }))
        : updateConversationState({
          userId,
          conversationId,
          memoryState: {
            pendingWorkflow: nextPendingWorkflow as unknown as JsonObject
          },
          metadata: {
            clarificationStatus: "pending",
            completenessScore: evaluation.completenessScore
          }
        }));
      const response = buildClarificationResponse({
        workflowTitle: typeof input.metadata?.workflowTitle === "string"
          ? input.metadata.workflowTitle
          : workflow,
        questions: nextPendingWorkflow.questions,
        memoryAcknowledgement: memoryDetection.acknowledgement
      });

      return {
        kind: "clarification",
        workflow,
        userId,
        conversationId,
        userMessage,
        memoryDetection,
        clarification: {
          response,
          evaluation,
          pendingWorkflow: nextPendingWorkflow
        }
      };
    }

    if (pendingWorkflow) {
      await (timing
        ? timing.time("chat.clear_pending_workflow", () => updateConversationState({
          userId,
          conversationId,
          memoryState: {
            pendingWorkflow: null
          },
          metadata: {
            clarificationStatus: "resolved",
            completenessScore: evaluation.completenessScore
          }
        }))
        : updateConversationState({
          userId,
          conversationId,
          memoryState: {
            pendingWorkflow: null
          },
          metadata: {
            clarificationStatus: "resolved",
            completenessScore: evaluation.completenessScore
          }
        }));
    }

    const budget = tokenBudgetEngine.getBudget({
      workflow,
      requestedAssetType: input.requestedAssetType,
      metadata: input.metadata
    });

    const context = await (timing
      ? timing.time("chat.build_context_assembly", () => buildContextAssembly({
        userId,
        conversationId,
        workflow,
        topic: combinedMessage,
        requestedAssetType: input.requestedAssetType,
        selectedKnowledgeSourceIds: input.selectedKnowledgeSourceIds,
        knowledgeSourceLimit: budget.knowledgeSourceLimit,
        conversationLimit: budget.conversationLimit,
        messagesPerConversation: budget.messagesPerConversation,
        extractedTextSnippetChars: budget.snippetChars,
        metadata: {
          ...(input.metadata ?? {}),
          tokenBudget: budget as unknown as JsonObject,
          userMessageId: userMessage.id,
          memoryDetection: memoryDetection as unknown as JsonObject,
          clarificationContext: evaluation.availableContext as unknown as JsonObject,
          clarificationScore: evaluation.completenessScore,
          contextResolver: {
            usedConversationContext: resolvedContext.usedConversationContext,
            conversationMessageCount: resolvedContext.conversationMessageCount,
            sources: resolvedContext.sources
          } as unknown as JsonObject
        }
      }))
      : buildContextAssembly({
        userId,
        conversationId,
        workflow,
        topic: combinedMessage,
        requestedAssetType: input.requestedAssetType,
        selectedKnowledgeSourceIds: input.selectedKnowledgeSourceIds,
        knowledgeSourceLimit: budget.knowledgeSourceLimit,
        conversationLimit: budget.conversationLimit,
        messagesPerConversation: budget.messagesPerConversation,
        extractedTextSnippetChars: budget.snippetChars,
        metadata: {
          ...(input.metadata ?? {}),
          tokenBudget: budget as unknown as JsonObject,
          userMessageId: userMessage.id,
          memoryDetection: memoryDetection as unknown as JsonObject,
          clarificationContext: evaluation.availableContext as unknown as JsonObject,
          clarificationScore: evaluation.completenessScore,
          contextResolver: {
            usedConversationContext: resolvedContext.usedConversationContext,
            conversationMessageCount: resolvedContext.conversationMessageCount,
            sources: resolvedContext.sources
          } as unknown as JsonObject
        }
      }));

    const llmPrompt = timing
      ? timing.timeSync("chat.build_prompt", () => new PromptBuilder(context).build(combinedMessage))
      : new PromptBuilder(context).build(combinedMessage);
    const finalPrompt = timing
      ? timing.timeSync("chat.compose_final_prompt", () => buildFinalPrompt(llmPrompt, input.responseInstructions))
      : buildFinalPrompt(llmPrompt, input.responseInstructions);
    timing?.mark("chat.final_prompt_ready", {
      finalPromptChars: finalPrompt.length,
      contextPromptChars: llmPrompt.contextPrompt.length,
      systemPromptChars: llmPrompt.systemPrompt.length,
      userPromptChars: llmPrompt.userPrompt.length
    });

    return {
      kind: "ready",
      workflow,
      userId,
      conversationId,
      userMessage,
      memoryDetection,
      context,
      llmPrompt,
      finalPrompt
    };
  }

  async generate(input: GenerateChatCompletionInput): Promise<ChatServiceGenerateResult> {
    const turn = await this.startTurn(input);
    if (turn.kind === "clarification") {
      return {
        ...turn,
        rawText: turn.clarification.response
      };
    }
    const gatewayResponse = await aiGateway.executePrepared({
      userId: turn.userId,
      conversationId: turn.conversationId,
      workflowType: turn.workflow,
      prompt: input.message,
      finalPrompt: turn.finalPrompt,
      context: turn.context,
      llmPrompt: turn.llmPrompt,
      metadata: {
        ...(input.metadata ?? {}),
        userMessageId: turn.userMessage.id
      },
      responseInstructions: input.responseInstructions,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      timing: input.timing
    });

    return {
      ...turn,
      rawText: gatewayResponse.rawText
    };
  }

  async finishTurn(input: FinishChatTurnInput) {
    const assistantMessage = await addMessage({
      userId: input.userId,
      conversationId: input.conversationId,
      role: "assistant",
      content: input.assistantContent,
      contentJson: input.assistantJson ?? {},
      metadata: input.metadata
    });

    await touchConversation(input.userId, input.conversationId);
    return assistantMessage;
  }
}

export const chatService = new ChatService();
