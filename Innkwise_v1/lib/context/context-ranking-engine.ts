import type {
  ContextAssembly,
  ContextConversation,
  ContextCreatorProfile,
  ContextKnowledgeSource,
  ContextMessage,
  ContextWorkflow
} from "@/backend/context/context-engine";
import type { JsonObject } from "@/shared/types/creator-os";

export type RankedContextItem = {
  id: string;
  kind: "creator" | "memory" | "knowledge" | "conversation";
  label: string;
  text: string;
  score: number;
  priority: number;
};

export type RankedContext = {
  creator: RankedContextItem[];
  memory: RankedContextItem[];
  knowledge: RankedContextItem[];
  conversation: RankedContextItem[];
};

function normalizeText(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "").trim();
}

function keywords(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
  );
}

function overlapScore(text: string, query: string) {
  const textKeywords = keywords(text);
  const queryKeywords = keywords(query);
  if (!textKeywords.size || !queryKeywords.size) return 0;
  let overlap = 0;
  for (const word of queryKeywords) {
    if (textKeywords.has(word)) overlap += 1;
  }
  return overlap / Math.max(1, queryKeywords.size);
}

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function creatorFieldWeights(workflow: ContextWorkflow): Record<string, number> {
  const base = {
    audience: 0.95,
    platformPreferences: 0.9,
    writingPreferences: 0.85,
    goals: 0.85,
    niche: 0.8,
    archetypes: 0.55,
    experienceLevel: 0.45,
    creatorName: 0.4,
    brandName: 0.45,
    tagline: 0.45,
    bio: 0.45,
    aiControls: 0.35
  };

  if (workflow === "research") {
    return { ...base, audience: 1, niche: 0.95, goals: 0.75, writingPreferences: 0.55 };
  }
  if (workflow === "script") {
    return { ...base, writingPreferences: 1, audience: 0.95, platformPreferences: 0.95, archetypes: 0.7 };
  }
  if (workflow === "production") {
    return { ...base, platformPreferences: 1, writingPreferences: 0.75, audience: 0.7 };
  }
  if (workflow === "distribution") {
    return { ...base, platformPreferences: 1, goals: 0.95, audience: 0.9, niche: 0.75 };
  }
  if (workflow === "strategy") {
    return { ...base, goals: 1, audience: 1, niche: 0.95, platformPreferences: 0.9 };
  }
  return base;
}

function creatorItems(profile: ContextCreatorProfile | null, workflow: ContextWorkflow, query: string): RankedContextItem[] {
  if (!profile) return [];
  const fields: Array<[string, unknown, string]> = [
    ["audience", profile.audience, "Audience"],
    ["platformPreferences", profile.platformPreferences, "Platform preferences"],
    ["writingPreferences", profile.writingPreferences, "Writing preferences"],
    ["goals", profile.goals, "Creator goals"],
    ["niche", profile.niche, "Creator niche"],
    ["archetypes", profile.archetypes, "Creator archetypes"],
    ["experienceLevel", profile.experienceLevel, "Experience level"],
    ["creatorName", profile.creatorName, "Creator name"],
    ["brandName", profile.brandName, "Brand name"],
    ["tagline", profile.tagline, "Tagline"],
    ["bio", profile.bio, "Creator bio"],
    ["aiControls", profile.aiControls, "AI controls"]
  ];
  const weights = creatorFieldWeights(workflow);
  const items: RankedContextItem[] = [];

  for (const [key, value, label] of fields) {
    const text = normalizeText(value);
    const emptyJson = text === "{}" || text === "[]";
    if (!text || text === "null" || emptyJson) continue;
    const weight = weights[key] ?? 0.4;
    items.push({
      id: `creator:${key}`,
      kind: "creator",
      label,
      text,
      priority: 3,
      score: weight + overlapScore(text, query)
    });
  }

  return items.sort((a, b) => b.score - a.score);
}

function memoryItems(context: ContextAssembly, query: string): RankedContextItem[] {
  const durableFacts = asJsonObject(context.memorySummary.durableFacts);
  const items: RankedContextItem[] = [];

  for (const [key, value] of Object.entries(durableFacts)) {
    const text = normalizeText(value);
    if (!text || text === "{}") continue;
    items.push({
      id: `memory:${key}`,
      kind: "memory",
      label: key.replace(/_/g, " "),
      text,
      priority: 4,
      score: 0.75 + overlapScore(text, query)
    });
  }

  return items.sort((a, b) => b.score - a.score);
}

function knowledgeItems(sources: ContextKnowledgeSource[], query: string): RankedContextItem[] {
  return sources
    .map((source) => {
      const text = [
        source.title,
        source.summary,
        source.tags.join(", "),
        source.extractedTextSnippet
      ].filter(Boolean).join("\n");
      return {
        id: `knowledge:${source.id}`,
        kind: "knowledge" as const,
        label: source.title,
        text,
        priority: 5,
        score: source.similarity + overlapScore(text, query)
      };
    })
    .sort((a, b) => b.score - a.score);
}

function messageText(message: ContextMessage) {
  return normalizeText(message.content ?? message.contentJson);
}

function conversationItems(conversations: ContextConversation[], query: string): RankedContextItem[] {
  const items: RankedContextItem[] = [];
  for (const conversation of conversations) {
    conversation.recentMessages.forEach((message, index) => {
      const text = messageText(message);
      if (!text) return;
      const recencyScore = (index + 1) / Math.max(1, conversation.recentMessages.length);
      const roleScore = message.role === "user" ? 0.2 : 0.1;
      items.push({
        id: `conversation:${message.id}`,
        kind: "conversation",
        label: `${message.role} in ${conversation.title ?? "recent conversation"}`,
        text,
        priority: 6,
        score: 0.45 + roleScore + recencyScore * 0.25 + overlapScore(text, query)
      });
    });
  }
  return items.sort((a, b) => b.score - a.score);
}

export class ContextRankingEngine {
  rank(context: ContextAssembly): RankedContext {
    const query = context.topic ?? "";
    return {
      creator: creatorItems(context.creatorProfile, context.workflow, query),
      memory: memoryItems(context, query),
      knowledge: knowledgeItems(context.relevantKnowledgeSources, query),
      conversation: conversationItems(context.recentConversations, query)
    };
  }
}

export const contextRankingEngine = new ContextRankingEngine();
