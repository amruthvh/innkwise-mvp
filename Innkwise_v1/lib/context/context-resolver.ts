import {
  fetchRecentConversations,
  type ContextConversation,
  type ContextCreatorProfile,
  type ContextMessage,
  type ContextWorkflow
} from "@/backend/context/context-engine";
import type {
  ClarificationContext,
  ClarificationField,
  PendingWorkflowState
} from "@/lib/clarification/clarification-engine";
import {
  getCreatorShortcut,
  getCreatorShortcutByWorkflow,
  isShortcutInvocation
} from "@/lib/workflows/creator-shortcuts";
import type { JsonObject, JsonValue } from "@/shared/types/creator-os";

export type ResolvedContextSource = "message" | "conversation" | "profile" | "pending" | "metadata";

export type ResolvedCreatorContext = {
  context: ClarificationContext;
  sources: Partial<Record<ClarificationField, ResolvedContextSource>>;
  usedConversationContext: boolean;
  conversationMessageCount: number;
};

export type ResolveCreatorContextInput = {
  userId: string;
  conversationId: string;
  workflow: ContextWorkflow;
  workflowId?: string | null;
  message: string;
  creatorProfile: ContextCreatorProfile | null;
  pendingWorkflow?: PendingWorkflowState | null;
  recentConversations?: ContextConversation[];
  metadata?: JsonObject;
};

const platforms = ["youtube", "instagram", "tiktok", "linkedin", "x", "twitter", "blog", "newsletter", "podcast"];
const formats = ["shorts", "short", "reels", "reel", "long-form", "long form", "video", "carousel", "thread", "article", "email", "podcast"];

function meaningful(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(meaningful);
  return false;
}

function setContext(
  resolved: ResolvedCreatorContext,
  field: ClarificationField,
  value: string | string[] | undefined,
  source: ResolvedContextSource
) {
  if (!meaningful(value) || meaningful(resolved.context[field])) return;
  resolved.context[field] = value;
  resolved.sources[field] = source;
  if (source === "conversation") resolved.usedConversationContext = true;
}

function findJsonValue(value: JsonValue | undefined, keys: string[]): string | string[] | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (strings.length) return strings;
    for (const item of value) {
      const nested = findJsonValue(item, keys);
      if (nested) return nested;
    }
    return undefined;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (keys.includes(key.toLowerCase())) {
      if (typeof nested === "string" && nested.trim()) return nested;
      if (Array.isArray(nested)) {
        const strings = nested.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
        if (strings.length) return strings;
      }
    }
    const found = findJsonValue(nested, keys);
    if (found) return found;
  }
  return undefined;
}

function knownValues(text: string, values: string[]) {
  const normalized = text.toLowerCase();
  return Array.from(new Set(values.filter((value) => normalized.includes(value))));
}

function extractAudience(text: string) {
  const patterns = [
    /\b(?:target\s+)?audience\s+(?:is|are)\s+([^.!?\n]+)/i,
    /\b(?:for|serve|help)\s+(children|kids|parents|creators|founders|students|professionals|beginners|experts|marketers|entrepreneurs)(?:\b[^.!?\n]*)?/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function extractGoal(text: string) {
  const direct = text.match(/\b(?:goal|objective)\s+(?:is|to)\s+([^.!?\n]+)/i);
  if (direct?.[1]) return direct[1].trim();
  return text.match(/\b(audience growth|revenue growth|lead generation|authority building|community building|product sales|service sales|brand awareness|engagement|watch time|conversion)\b/i)?.[1];
}

function extractTopic(text: string) {
  const patterns = [
    /\b(?:about|around|topic(?:\s+is)?|research)\s+["']?([^.!?\n"']+)/i,
    /\bscript\s+(?:for|on|about)\s+["']?([^.!?\n"']+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function looksLikeScript(text: string) {
  return text.length > 180 && (
    /#\s*(script|script objective)/i.test(text)
    || /\b(hook|pattern interrupt|cta|voiceover|shot)\b/i.test(text)
    || /\b0:00\b/.test(text)
  );
}

function priorMessages(messages: ContextMessage[], currentMessage: string) {
  let skippedCurrent = false;
  return [...messages].reverse().filter((message) => {
    if (!skippedCurrent && message.role === "user" && message.content?.trim() === currentMessage.trim()) {
      skippedCurrent = true;
      return false;
    }
    return true;
  });
}

function conversationValue(
  messages: ContextMessage[],
  field: ClarificationField,
  currentMessage: string
) {
  const prior = priorMessages(messages, currentMessage);

  if (field === "source_content") {
    const script = prior.find((message) => message.role === "assistant" && looksLikeScript(message.content ?? ""));
    return script?.content ?? undefined;
  }

  for (const message of prior) {
    const content = message.content?.trim();
    if (!content) continue;
    if (field === "topic" && message.role === "user") {
      const topic = extractTopic(content);
      if (topic) return topic;
      if (content.length > 8 && content.length < 280 && !/^\d+[.)]/.test(content)) return content;
    }
    if (field === "audience") {
      const audience = extractAudience(content);
      if (audience) return audience;
    }
    if (field === "platform") {
      const found = knownValues(content, platforms);
      if (found.length) return found;
    }
    if (field === "content_format") {
      const found = knownValues(content, formats);
      if (found.length) return found;
    }
    if (field === "goal" || field === "objective") {
      const goal = extractGoal(content);
      if (goal) return goal;
    }
  }
  return undefined;
}

function profileValue(profile: ContextCreatorProfile | null, field: ClarificationField) {
  if (!profile) return undefined;
  if (field === "audience") return findJsonValue(profile.audience, ["audience", "detectedaudience", "targetaudience"]);
  if (field === "platform") return findJsonValue(profile.platformPreferences, ["platforms", "detectedplatforms", "primaryplatform"]);
  if (field === "content_format") return findJsonValue(profile.platformPreferences, ["contentformats", "contentformat", "format"]);
  if (field === "goal" || field === "objective") return findJsonValue(profile.goals, ["goals", "detectedgoals", "primarygoal", "objective"]);
  return undefined;
}

function metadataValue(metadata: JsonObject | undefined, field: ClarificationField) {
  if (!metadata) return undefined;
  const aliases: Record<ClarificationField, string[]> = {
    topic: ["topic", "query"],
    audience: ["audience"],
    platform: ["platform", "primaryplatform"],
    goal: ["goal", "primarygoal"],
    objective: ["objective", "goal", "primarygoal"],
    content_format: ["contentformat", "format", "videotype"],
    source_content: ["sourcecontent", "script"]
  };
  const value = findJsonValue(metadata, aliases[field]);
  if (field === "audience" && typeof value === "string" && value.toLowerCase() === "creators") return undefined;
  return value;
}

export async function resolveCreatorContext(input: ResolveCreatorContextInput): Promise<ResolvedCreatorContext> {
  const shortcut = getCreatorShortcut(input.workflowId) ?? getCreatorShortcutByWorkflow(input.workflow);
  const isInvocation = isShortcutInvocation(input.message, shortcut);
  const conversations = input.recentConversations ?? await fetchRecentConversations({
    userId: input.userId,
    conversationId: input.conversationId,
    limit: 1,
    messagesPerConversation: 10
  });
  const messages = conversations[0]?.recentMessages ?? [];
  const resolved: ResolvedCreatorContext = {
    context: {},
    sources: {},
    usedConversationContext: false,
    conversationMessageCount: messages.length
  };

  for (const [field, value] of Object.entries(input.pendingWorkflow?.collectedContext ?? {})) {
    setContext(resolved, field as ClarificationField, value, "pending");
  }

  if (!isInvocation) {
    const currentTopic = extractTopic(input.message);
    if (input.workflow === "research" || input.workflow === "script") {
      setContext(resolved, "topic", currentTopic ?? input.message.trim(), "message");
    }
    if (input.workflow === "production" && input.message.trim().length > 8) {
      setContext(resolved, "source_content", input.message.trim(), "message");
    }
    setContext(resolved, "audience", extractAudience(input.message), "message");
    setContext(resolved, "platform", knownValues(input.message, platforms), "message");
    setContext(resolved, "content_format", knownValues(input.message, formats), "message");
    const goal = extractGoal(input.message);
    setContext(resolved, "goal", goal, "message");
    setContext(resolved, "objective", goal, "message");
  }

  const requiredFields = shortcut?.requiredContext ?? [];
  for (const field of requiredFields) {
    setContext(resolved, field, metadataValue(input.metadata, field), "metadata");
    setContext(resolved, field, profileValue(input.creatorProfile, field), "profile");
    setContext(resolved, field, conversationValue(messages, field, input.message), "conversation");
  }

  if (input.workflow === "production" && !meaningful(resolved.context.source_content)) {
    setContext(resolved, "source_content", resolved.context.topic, resolved.sources.topic ?? "message");
  }

  return resolved;
}

export class ContextResolver {
  resolve(input: ResolveCreatorContextInput) {
    return resolveCreatorContext(input);
  }
}

export const contextResolver = new ContextResolver();
