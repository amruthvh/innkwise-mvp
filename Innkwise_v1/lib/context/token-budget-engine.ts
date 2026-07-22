import type { ContextWorkflow } from "@/backend/context/context-engine";
import type { GeneratedAssetType, JsonObject } from "@/shared/types/creator-os";

export type TokenBudgetInput = {
  workflow: ContextWorkflow;
  workflowId?: string | null;
  requestedAssetType?: GeneratedAssetType | null;
  videoType?: string | null;
  length?: number | null;
  metadata?: JsonObject | null;
};

export type WorkflowTokenBudget = {
  key: string;
  maxContextTokens: number;
  maxOutputTokens: number;
  softExpansionTokens: number;
  knowledgeSourceLimit: number;
  messagesPerConversation: number;
  conversationLimit: number;
  snippetChars: number;
};

const APPROX_CHARS_PER_TOKEN = 4;

export function estimateTextTokens(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / APPROX_CHARS_PER_TOKEN));
}

export function tokenChars(tokens: number) {
  return Math.max(0, Math.floor(tokens * APPROX_CHARS_PER_TOKEN));
}

function metadataString(metadata: JsonObject | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" ? value : null;
}

function metadataNumber(metadata: JsonObject | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveWorkflowKey(input: TokenBudgetInput) {
  const workflowId = input.workflowId ?? metadataString(input.metadata, "workflowId");
  const videoType = input.videoType ?? metadataString(input.metadata, "videoType");
  const length = input.length ?? metadataNumber(input.metadata, "length");

  if (workflowId === "creator-chat" || input.workflow === "general") return "chat";
  if (workflowId === "research-topic" || input.workflow === "research") return "research";
  if (workflowId === "content-strategy" || input.workflow === "strategy") return "strategy";
  if (workflowId === "production-kit" || input.workflow === "production") return "production";
  if (workflowId === "posting-strategy" || input.workflow === "distribution") return "distribution";
  if (workflowId === "generate-thumbnail") return "thumbnail";
  if (workflowId === "regenerate-hooks") return "hooks";
  if (workflowId === "rewrite-section") return "rewrite";

  if (workflowId === "generate-script" || input.workflow === "script") {
    if (videoType === "shorts") {
      if ((length ?? 1) <= 1) return "short_script_1";
      if ((length ?? 1) <= 2) return "short_script_2";
      return "short_script_3";
    }
    return "long_script";
  }

  return input.workflow;
}

const budgets: Record<string, WorkflowTokenBudget> = {
  chat: {
    key: "chat",
    maxContextTokens: 800,
    maxOutputTokens: 700,
    softExpansionTokens: 250,
    knowledgeSourceLimit: 2,
    messagesPerConversation: 4,
    conversationLimit: 1,
    snippetChars: 700
  },
  research: {
    key: "research",
    maxContextTokens: 2000,
    maxOutputTokens: 1400,
    softExpansionTokens: 500,
    knowledgeSourceLimit: 3,
    messagesPerConversation: 6,
    conversationLimit: 1,
    snippetChars: 1100
  },
  strategy: {
    key: "strategy",
    maxContextTokens: 1400,
    maxOutputTokens: 1200,
    softExpansionTokens: 350,
    knowledgeSourceLimit: 3,
    messagesPerConversation: 5,
    conversationLimit: 1,
    snippetChars: 850
  },
  long_script: {
    key: "long_script",
    maxContextTokens: 1800,
    maxOutputTokens: 1800,
    softExpansionTokens: 400,
    knowledgeSourceLimit: 3,
    messagesPerConversation: 5,
    conversationLimit: 1,
    snippetChars: 900
  },
  short_script_1: {
    key: "short_script_1",
    maxContextTokens: 700,
    maxOutputTokens: 700,
    softExpansionTokens: 200,
    knowledgeSourceLimit: 2,
    messagesPerConversation: 3,
    conversationLimit: 1,
    snippetChars: 500
  },
  short_script_2: {
    key: "short_script_2",
    maxContextTokens: 900,
    maxOutputTokens: 1000,
    softExpansionTokens: 250,
    knowledgeSourceLimit: 2,
    messagesPerConversation: 4,
    conversationLimit: 1,
    snippetChars: 650
  },
  short_script_3: {
    key: "short_script_3",
    maxContextTokens: 1100,
    maxOutputTokens: 1300,
    softExpansionTokens: 300,
    knowledgeSourceLimit: 2,
    messagesPerConversation: 4,
    conversationLimit: 1,
    snippetChars: 750
  },
  production: {
    key: "production",
    maxContextTokens: 1000,
    maxOutputTokens: 1000,
    softExpansionTokens: 300,
    knowledgeSourceLimit: 2,
    messagesPerConversation: 5,
    conversationLimit: 1,
    snippetChars: 700
  },
  distribution: {
    key: "distribution",
    maxContextTokens: 800,
    maxOutputTokens: 800,
    softExpansionTokens: 250,
    knowledgeSourceLimit: 2,
    messagesPerConversation: 4,
    conversationLimit: 1,
    snippetChars: 600
  },
  thumbnail: {
    key: "thumbnail",
    maxContextTokens: 600,
    maxOutputTokens: 500,
    softExpansionTokens: 150,
    knowledgeSourceLimit: 1,
    messagesPerConversation: 3,
    conversationLimit: 1,
    snippetChars: 450
  },
  hooks: {
    key: "hooks",
    maxContextTokens: 500,
    maxOutputTokens: 400,
    softExpansionTokens: 150,
    knowledgeSourceLimit: 1,
    messagesPerConversation: 3,
    conversationLimit: 1,
    snippetChars: 400
  },
  rewrite: {
    key: "rewrite",
    maxContextTokens: 700,
    maxOutputTokens: 1200,
    softExpansionTokens: 200,
    knowledgeSourceLimit: 1,
    messagesPerConversation: 3,
    conversationLimit: 1,
    snippetChars: 500
  }
};

const fallbackBudget: WorkflowTokenBudget = {
  key: "default",
  maxContextTokens: 1000,
  maxOutputTokens: 1000,
  softExpansionTokens: 250,
  knowledgeSourceLimit: 2,
  messagesPerConversation: 4,
  conversationLimit: 1,
  snippetChars: 700
};

export class TokenBudgetEngine {
  getBudget(input: TokenBudgetInput): WorkflowTokenBudget {
    return budgets[resolveWorkflowKey(input)] ?? fallbackBudget;
  }

  getOutputTokenBudget(input: TokenBudgetInput) {
    return this.getBudget(input).maxOutputTokens;
  }

  getContextBudget(input: TokenBudgetInput) {
    const budget = this.getBudget(input);
    return budget.maxContextTokens + budget.softExpansionTokens;
  }
}

export const tokenBudgetEngine = new TokenBudgetEngine();
