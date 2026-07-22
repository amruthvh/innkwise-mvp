import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma/client";
import { searchRelevantKnowledge } from "@/lib/retrieval/semantic-retrieval";
import type { RelevantKnowledgeSource } from "@/lib/retrieval/types";
import type {
  ContextAssemblyInput,
  GeneratedAssetType,
  JsonObject,
  JsonValue,
  KnowledgeSourceType,
  MessageRole
} from "@/shared/types/creator-os";

export type ContextWorkflow = "research" | "strategy" | "script" | "production" | "distribution" | "general";

export type ContextCreatorProfile = {
  id: string;
  creatorName: string | null;
  brandName: string | null;
  tagline: string | null;
  bio: string | null;
  experienceLevel: string | null;
  archetypes: string[];
  goals: JsonObject;
  niche: JsonObject;
  audience: JsonObject;
  platformPreferences: JsonObject;
  writingPreferences: JsonObject;
  aiControls: JsonObject;
  memory: JsonObject;
};

export type ContextKnowledgeSource = RelevantKnowledgeSource;

export type ContextMessage = {
  id: string;
  role: MessageRole;
  content: string | null;
  contentJson: JsonObject;
  createdAt: string;
};

export type ContextConversation = {
  id: string;
  title: string | null;
  status: string;
  contextSnapshot: JsonObject;
  memoryState: JsonObject;
  metadata: JsonObject;
  createdAt: string;
  recentMessages: ContextMessage[];
};

export type ContextAssembly = {
  version: "context-engine-v1";
  assembledAt: string;
  userId: string;
  workflow: ContextWorkflow;
  topic: string | null;
  requestedAssetType: GeneratedAssetType | null;
  creatorProfile: ContextCreatorProfile | null;
  relevantKnowledgeSources: ContextKnowledgeSource[];
  recentConversations: ContextConversation[];
  memory: {
    creator: JsonObject;
    conversations: JsonObject[];
    metadata: JsonObject;
  };
  memorySummary: {
    available: boolean;
    confidence: number | null;
    durableFacts: JsonObject;
    categories: string[];
    lastDetectionAt: string | null;
  };
  limits: {
    knowledgeSourceLimit: number;
    conversationLimit: number;
    messagesPerConversation: number;
    extractedTextSnippetChars: number;
  };
  metadata: JsonObject;
};

export type BuildContextOptions = ContextAssemblyInput & {
  workflow: ContextWorkflow;
  knowledgeSourceLimit?: number;
  conversationLimit?: number;
  messagesPerConversation?: number;
  extractedTextSnippetChars?: number;
  creatorProfile?: ContextCreatorProfile | null;
  recentConversations?: ContextConversation[];
};

type DbRow = Record<string, unknown>;

const DEFAULT_KNOWLEDGE_SOURCE_LIMIT = 8;
const DEFAULT_CONVERSATION_LIMIT = 5;
const DEFAULT_MESSAGES_PER_CONVERSATION = 6;
const DEFAULT_SNIPPET_CHARS = 1200;

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function asIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function truncate(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars).trim()}...` : trimmed;
}

function mapCreatorProfile(row: DbRow | undefined): ContextCreatorProfile | null {
  if (!row) return null;

  return {
    id: String(row.id),
    creatorName: row.creator_name ? String(row.creator_name) : null,
    brandName: row.brand_name ? String(row.brand_name) : null,
    tagline: row.tagline ? String(row.tagline) : null,
    bio: row.bio ? String(row.bio) : null,
    experienceLevel: row.experience_level ? String(row.experience_level) : null,
    archetypes: asStringArray(row.archetypes),
    goals: asJsonObject(row.goals),
    niche: asJsonObject(row.niche),
    audience: asJsonObject(row.audience),
    platformPreferences: asJsonObject(row.platform_preferences),
    writingPreferences: asJsonObject(row.writing_preferences),
    aiControls: asJsonObject(row.ai_controls),
    memory: asJsonObject(row.memory)
  };
}

function mapConversation(row: DbRow): ContextConversation {
  return {
    id: String(row.id),
    title: row.title ? String(row.title) : null,
    status: String(row.status ?? "active"),
    contextSnapshot: asJsonObject(row.context_snapshot),
    memoryState: asJsonObject(row.memory_state),
    metadata: asJsonObject(row.metadata),
    createdAt: asIso(row.created_at),
    recentMessages: []
  };
}

function mapMessage(row: DbRow): ContextMessage {
  return {
    id: String(row.id),
    role: String(row.role) as MessageRole,
    content: row.content ? String(row.content) : null,
    contentJson: asJsonObject(row.content_json),
    createdAt: asIso(row.created_at)
  };
}

function buildMemorySummary(creatorProfile: ContextCreatorProfile | null): ContextAssembly["memorySummary"] {
  const memory = creatorProfile?.memory ?? {};
  const memoryManager = asJsonObject(memory.memoryManager);
  const durableFacts = asJsonObject(memoryManager.durableFacts);
  const categories = asStringArray(memoryManager.categories);
  if (!categories.length) {
    for (const fact of Object.values(durableFacts)) {
      const row = asJsonObject(fact);
      if (typeof row.type === "string" && !categories.includes(row.type)) {
        categories.push(row.type);
      }
    }
  }
  const rawConfidence = memoryManager.confidence;
  const confidence = typeof rawConfidence === "number" ? rawConfidence : null;
  const lastDetectionAt = typeof memoryManager.lastDetectionAt === "string" ? memoryManager.lastDetectionAt : null;

  return {
    available: Object.keys(durableFacts).length > 0 || categories.length > 0,
    confidence,
    durableFacts,
    categories,
    lastDetectionAt
  };
}

function uuidListSql(ids: string[]) {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
}

export async function fetchCreatorProfile(userId: string): Promise<ContextCreatorProfile | null> {
  const rows = await prisma.$queryRaw<DbRow[]>`
    select *
    from public.creator_profiles
    where user_id = ${userId}::uuid
    limit 1
  `;

  return mapCreatorProfile(rows[0]);
}

export async function fetchRelevantKnowledgeSources(input: {
  userId: string;
  query: string;
  selectedKnowledgeSourceIds?: string[];
  limit?: number;
  snippetChars?: number;
}): Promise<ContextKnowledgeSource[]> {
  if (!input.query.trim()) return [];

  try {
    return await searchRelevantKnowledge(input.query, {
      userId: input.userId,
      limit: input.limit ?? DEFAULT_KNOWLEDGE_SOURCE_LIMIT,
      selectedKnowledgeSourceIds: input.selectedKnowledgeSourceIds,
      extractedTextSnippetChars: input.snippetChars ?? DEFAULT_SNIPPET_CHARS
    });
  } catch (error) {
    console.error("[context-engine] semantic retrieval failed", error);
    return [];
  }
}

export async function fetchRecentConversations(input: {
  userId: string;
  conversationId?: string;
  limit?: number;
  messagesPerConversation?: number;
}): Promise<ContextConversation[]> {
  const limit = input.limit ?? DEFAULT_CONVERSATION_LIMIT;
  const messagesPerConversation = input.messagesPerConversation ?? DEFAULT_MESSAGES_PER_CONVERSATION;
  const conversationFilter = input.conversationId
    ? Prisma.sql`and id = ${input.conversationId}::uuid`
    : Prisma.empty;

  const conversationRows = await prisma.$queryRaw<DbRow[]>`
    select *
    from public.conversations
    where user_id = ${input.userId}::uuid
      and status = 'active'
      ${conversationFilter}
    order by updated_at desc, created_at desc
    limit ${limit}
  `;

  const conversations = conversationRows.map(mapConversation);
  if (!conversations.length) return conversations;

  const conversationIds = conversations.map((conversation) => conversation.id);
  const messageRows = await prisma.$queryRaw<DbRow[]>`
    select *
    from (
      select
        messages.*,
        row_number() over (
          partition by conversation_id
          order by created_at desc
        ) as message_rank
      from public.messages
      where user_id = ${input.userId}::uuid
        and conversation_id in (${uuidListSql(conversationIds)})
    ) ranked_messages
    where message_rank <= ${messagesPerConversation}
    order by conversation_id, created_at asc
  `;

  const messagesByConversation = new Map<string, ContextMessage[]>();
  for (const row of messageRows) {
    const conversationId = String(row.conversation_id);
    const messages = messagesByConversation.get(conversationId) ?? [];
    messages.push(mapMessage(row));
    messagesByConversation.set(conversationId, messages);
  }

  return conversations.map((conversation) => ({
    ...conversation,
    recentMessages: messagesByConversation.get(conversation.id) ?? []
  }));
}

export async function buildContextAssembly(options: BuildContextOptions): Promise<ContextAssembly> {
  const limits = {
    knowledgeSourceLimit: options.knowledgeSourceLimit ?? DEFAULT_KNOWLEDGE_SOURCE_LIMIT,
    conversationLimit: options.conversationLimit ?? DEFAULT_CONVERSATION_LIMIT,
    messagesPerConversation: options.messagesPerConversation ?? DEFAULT_MESSAGES_PER_CONVERSATION,
    extractedTextSnippetChars: options.extractedTextSnippetChars ?? DEFAULT_SNIPPET_CHARS
  };

  const retrievalQuery =
    options.topic?.trim() ||
    (typeof options.metadata?.query === "string" ? options.metadata.query : "") ||
    "";

  const [creatorProfile, relevantKnowledgeSources, recentConversations] = await Promise.all([
    options.creatorProfile !== undefined
      ? Promise.resolve(options.creatorProfile)
      : fetchCreatorProfile(options.userId),
    fetchRelevantKnowledgeSources({
      userId: options.userId,
      query: retrievalQuery,
      selectedKnowledgeSourceIds: options.selectedKnowledgeSourceIds,
      limit: limits.knowledgeSourceLimit,
      snippetChars: limits.extractedTextSnippetChars
    }),
    options.recentConversations
      ? Promise.resolve(options.recentConversations)
      : fetchRecentConversations({
        userId: options.userId,
        conversationId: options.conversationId,
        limit: limits.conversationLimit,
        messagesPerConversation: limits.messagesPerConversation
      })
  ]);

  return {
    version: "context-engine-v1",
    assembledAt: new Date().toISOString(),
    userId: options.userId,
    workflow: options.workflow,
    topic: options.topic?.trim() || null,
    requestedAssetType: options.requestedAssetType ?? null,
    creatorProfile,
    relevantKnowledgeSources,
    recentConversations,
    memory: {
      creator: creatorProfile?.memory ?? {},
      conversations: recentConversations.map((conversation) => conversation.memoryState),
      metadata: {
        selectedKnowledgeSourceIds: (options.selectedKnowledgeSourceIds ?? []) as JsonValue,
        futureMemoryExpansion: {
          semanticRecall: false,
          longTermUserMemory: false,
          episodicConversationMemory: false
        }
      } as JsonObject
    },
    memorySummary: buildMemorySummary(creatorProfile),
    limits,
    metadata: options.metadata ?? {}
  };
}
