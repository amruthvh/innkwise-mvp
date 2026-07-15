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

const DEFAULT_KNOWLEDGE_SOURCE_LIMIT = 5;
const DEFAULT_MESSAGES_PER_CONVERSATION = 10;

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
    const authUser = await getAuthenticatedUser(input.req);
    const authUserId = authUser.id;
    const userId = toCreatorUserId(authUser.id);
    const validatedInput = await inputValidator.validateChatRequest(userId, {
      prompt: input.message,
      workflowType: input.workflow,
      conversationId: input.conversationId,
      attachments: []
    });
    const message = validatedInput.prompt;
    const requestedWorkflow = validatedInput.workflowType;
    const requestedConversationId = validatedInput.conversationId;

    await ensureProfileForAppUser({
      id: userId,
      email: authUser.email
    });

    const conversationId = requestedConversationId || (await createConversation({
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
    })).id;

    const userMessage = await addMessage({
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
    });

    await touchConversation(userId, conversationId);
    const memoryDetection = await memoryManager.detectAndStore({
      userId,
      message
    });
    const conversationState = await getConversationState(userId, conversationId);
    const pendingValue = conversationState?.memoryState.pendingWorkflow;
    const pendingWorkflow = isPendingWorkflowState(pendingValue) ? pendingValue : null;
    const workflow = pendingWorkflow?.workflow ?? requestedWorkflow;
    const creatorProfile = await fetchCreatorProfile(userId);
    const combinedMessage = pendingWorkflow
      ? `${pendingWorkflow.originalMessage}\n\nAdditional context from the user:\n${message}`
      : message;
    const resolvedContext = await contextResolver.resolve({
      userId,
      conversationId,
      workflow,
      workflowId: typeof input.metadata?.workflowId === "string" ? input.metadata.workflowId : null,
      message,
      creatorProfile,
      pendingWorkflow,
      metadata: input.metadata
    });
    const evaluation = evaluateContextCompleteness({
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
      await updateConversationState({
        userId,
        conversationId,
        memoryState: {
          pendingWorkflow: nextPendingWorkflow as unknown as JsonObject
        },
        metadata: {
          clarificationStatus: "pending",
          completenessScore: evaluation.completenessScore
        }
      });
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
      await updateConversationState({
        userId,
        conversationId,
        memoryState: {
          pendingWorkflow: null
        },
        metadata: {
          clarificationStatus: "resolved",
          completenessScore: evaluation.completenessScore
        }
      });
    }

    const context = await buildContextAssembly({
      userId,
      conversationId,
      workflow,
      topic: combinedMessage,
      requestedAssetType: input.requestedAssetType,
      selectedKnowledgeSourceIds: input.selectedKnowledgeSourceIds,
      knowledgeSourceLimit: DEFAULT_KNOWLEDGE_SOURCE_LIMIT,
      conversationLimit: 1,
      messagesPerConversation: DEFAULT_MESSAGES_PER_CONVERSATION,
      metadata: {
        ...(input.metadata ?? {}),
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
    });

    const llmPrompt = new PromptBuilder(context).build(combinedMessage);
    const finalPrompt = buildFinalPrompt(llmPrompt, input.responseInstructions);

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
      temperature: input.temperature
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
