import { buildContextAssembly, fetchCreatorProfile } from "@/backend/context/context-engine";
import { PromptBuilder } from "@/backend/context/prompt-builder";
import { getConversationState } from "@/backend/creator-os/crud-service";
import { memoryManager } from "@/backend/memory/memory-manager";
import {
  evaluateContextCompleteness,
  isPendingWorkflowState
} from "@/lib/clarification/clarification-engine";
import { ForbiddenError } from "@/lib/auth/errors";
import { contextResolver } from "@/lib/context/context-resolver";
import type { AIGatewayExecuteInput } from "@/lib/ai/gateway/GatewayTypes";

const DEFAULT_KNOWLEDGE_SOURCE_LIMIT = 5;
const DEFAULT_MESSAGES_PER_CONVERSATION = 10;

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never;
}

function buildFinalPrompt(systemPrompt: string, contextPrompt: string, userPrompt: string, responseInstructions?: string) {
  return [
    systemPrompt,
    "",
    contextPrompt,
    "",
    responseInstructions?.trim()
      ? ["## Response Instructions", responseInstructions.trim()].join("\n")
      : "",
    "",
    userPrompt
  ].filter(Boolean).join("\n\n");
}

export class RequestPipeline {
  async prepare(input: AIGatewayExecuteInput) {
    if (!input.userId) {
      throw new ForbiddenError("Authenticated user is required.");
    }

    const message = input.prompt.trim();
    if (!message) {
      throw new Error("Prompt is required.");
    }

    if (input.conversationId) {
      const conversation = await getConversationState(input.userId, input.conversationId);
      if (!conversation) {
        throw new ForbiddenError("Conversation access denied.");
      }
    }

    const memoryDetection = await memoryManager.detectAndStore({
      userId: input.userId,
      message
    });

    const conversationState = input.conversationId
      ? await getConversationState(input.userId, input.conversationId)
      : null;
    const pendingWorkflow = isPendingWorkflowState(conversationState?.memoryState.pendingWorkflow)
      ? conversationState?.memoryState.pendingWorkflow
      : null;
    const workflow = pendingWorkflow?.workflow ?? input.workflowType;
    const creatorProfile = await fetchCreatorProfile(input.userId);
    const resolvedContext = await contextResolver.resolve({
      userId: input.userId,
      conversationId: input.conversationId ?? "",
      workflow,
      workflowId: typeof input.metadata?.workflowId === "string" ? input.metadata.workflowId : null,
      message,
      creatorProfile,
      pendingWorkflow,
      metadata: input.metadata
    });

    const clarification = evaluateContextCompleteness({
      workflow,
      message,
      creatorProfile,
      metadata: input.metadata,
      pendingContext: resolvedContext.context
    });

    const context = await buildContextAssembly({
      userId: input.userId,
      conversationId: input.conversationId ?? undefined,
      workflow,
      topic: message,
      requestedAssetType: input.requestedAssetType,
      selectedKnowledgeSourceIds: input.selectedKnowledgeSourceIds,
      knowledgeSourceLimit: DEFAULT_KNOWLEDGE_SOURCE_LIMIT,
      conversationLimit: 1,
      messagesPerConversation: DEFAULT_MESSAGES_PER_CONVERSATION,
      metadata: {
        ...(input.metadata ?? {}),
        memoryDetection,
        clarificationContext: clarification.availableContext,
        clarificationScore: clarification.completenessScore,
        attachments: jsonSafe(input.attachments ?? [])
      }
    });

    const llmPrompt = new PromptBuilder(context).build(message);
    const finalPrompt = buildFinalPrompt(
      llmPrompt.systemPrompt,
      llmPrompt.contextPrompt,
      llmPrompt.userPrompt,
      input.responseInstructions
    );

    return {
      workflow,
      context,
      llmPrompt,
      finalPrompt,
      memoryDetection,
      clarification
    };
  }
}
