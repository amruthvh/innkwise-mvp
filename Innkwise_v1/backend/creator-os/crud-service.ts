import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma/client";
import type {
  CreatorProfile,
  GeneratedAsset,
  GeneratedAssetType,
  JsonObject,
  KnowledgeSource,
  KnowledgeSourceType,
  Message,
  MessageRole,
  Profile,
  ProfilePlan,
  UsageMetric
} from "@/shared/types/creator-os";

type DbRow = Record<string, unknown>;

const emptyJson = {} as JsonObject;

function jsonb(value: JsonObject | unknown[] | null | undefined) {
  return Prisma.sql`${JSON.stringify(value ?? emptyJson)}::jsonb`;
}

function textArray(values?: string[]) {
  return values ?? [];
}

function iso(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function mapProfile(row: DbRow): Profile {
  return {
    id: String(row.id),
    email: row.email ? String(row.email) : null,
    fullName: row.full_name ? String(row.full_name) : null,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    plan: String(row.plan ?? "FREE") as ProfilePlan,
    stripeCustomerId: row.stripe_customer_id ? String(row.stripe_customer_id) : null,
    onboardingStatus: (row.onboarding_status ?? emptyJson) as JsonObject,
    preferences: (row.preferences ?? emptyJson) as JsonObject,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function mapCreatorProfile(row: DbRow): CreatorProfile {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    creatorName: row.creator_name ? String(row.creator_name) : null,
    brandName: row.brand_name ? String(row.brand_name) : null,
    tagline: row.tagline ? String(row.tagline) : null,
    bio: row.bio ? String(row.bio) : null,
    experienceLevel: row.experience_level ? String(row.experience_level) : null,
    archetypes: Array.isArray(row.archetypes) ? row.archetypes.map(String) : [],
    goals: (row.goals ?? emptyJson) as JsonObject,
    niche: (row.niche ?? emptyJson) as JsonObject,
    audience: (row.audience ?? emptyJson) as JsonObject,
    platformPreferences: (row.platform_preferences ?? emptyJson) as JsonObject,
    writingPreferences: (row.writing_preferences ?? emptyJson) as JsonObject,
    aiControls: (row.ai_controls ?? emptyJson) as JsonObject,
    memory: (row.memory ?? emptyJson) as JsonObject,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function mapKnowledgeSource(row: DbRow): KnowledgeSource {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    sourceType: String(row.source_type) as KnowledgeSourceType,
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    url: row.url ? String(row.url) : null,
    storageBucket: row.storage_bucket ? String(row.storage_bucket) : null,
    storagePath: row.storage_path ? String(row.storage_path) : null,
    mimeType: row.mime_type ? String(row.mime_type) : null,
    sizeBytes: row.size_bytes === null || row.size_bytes === undefined ? null : Number(row.size_bytes),
    checksum: row.checksum ? String(row.checksum) : null,
    extractionStatus: String(row.extraction_status ?? "pending") as KnowledgeSource["extractionStatus"],
    extractedText: row.extracted_text ? String(row.extracted_text) : null,
    summary: row.summary ? String(row.summary) : null,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    metadata: (row.metadata ?? emptyJson) as JsonObject,
    embeddingMetadata: (row.embedding_metadata ?? emptyJson) as JsonObject,
    isFavorite: Boolean(row.is_favorite),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function mapMessage(row: DbRow): Message {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    conversationId: String(row.conversation_id),
    role: String(row.role) as MessageRole,
    content: row.content ? String(row.content) : null,
    contentJson: (row.content_json ?? emptyJson) as JsonObject,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    tokenCount: Number(row.token_count ?? 0),
    metadata: (row.metadata ?? emptyJson) as JsonObject,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

function mapGeneratedAsset(row: DbRow): GeneratedAsset {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    sourceMessageId: row.source_message_id ? String(row.source_message_id) : null,
    assetType: String(row.asset_type) as GeneratedAssetType,
    title: row.title ? String(row.title) : null,
    prompt: row.prompt ? String(row.prompt) : null,
    outputText: row.output_text ? String(row.output_text) : null,
    outputJson: (row.output_json ?? emptyJson) as JsonObject,
    model: row.model ? String(row.model) : null,
    parameters: (row.parameters ?? emptyJson) as JsonObject,
    sourceContext: (row.source_context ?? emptyJson) as JsonObject,
    status: String(row.status ?? "completed") as GeneratedAsset["status"],
    storageBucket: row.storage_bucket ? String(row.storage_bucket) : null,
    storagePath: row.storage_path ? String(row.storage_path) : null,
    publicUrl: row.public_url ? String(row.public_url) : null,
    metadata: (row.metadata ?? emptyJson) as JsonObject,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

export async function upsertProfile(input: {
  id: string;
  email?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  plan?: ProfilePlan;
  preferences?: JsonObject;
}) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    insert into public.profiles (id, email, full_name, avatar_url, plan, preferences)
    values (${input.id}::uuid, ${input.email ?? null}, ${input.fullName ?? null}, ${input.avatarUrl ?? null}, ${input.plan ?? "FREE"}, ${jsonb(input.preferences)})
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      avatar_url = excluded.avatar_url,
      plan = excluded.plan,
      preferences = profiles.preferences || excluded.preferences
    returning *
  `;

  return mapProfile(rows[0]);
}

export type CreatorProject = {
  id: string;
  name: string;
  instructions: string;
  createdAt: string;
};

function parseCreatorProjects(value: unknown): CreatorProject[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((project) => {
    if (!project || typeof project !== "object") return [];
    const candidate = project as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.name !== "string") return [];

    return [{
      id: candidate.id,
      name: candidate.name,
      instructions: typeof candidate.instructions === "string" ? candidate.instructions : "",
      createdAt: typeof candidate.createdAt === "string"
        ? candidate.createdAt
        : new Date().toISOString()
    }];
  });
}

export async function listCreatorProjects(userId: string): Promise<CreatorProject[]> {
  const rows = await prisma.$queryRaw<DbRow[]>`
    select preferences -> 'projects' as projects
    from public.profiles
    where id = ${userId}::uuid
    limit 1
  `;

  return parseCreatorProjects(rows[0]?.projects);
}

export async function saveCreatorProjects(
  userId: string,
  projects: CreatorProject[]
): Promise<CreatorProject[]> {
  const normalizedProjects = parseCreatorProjects(projects);
  const rows = await prisma.$queryRaw<DbRow[]>`
    update public.profiles
    set
      preferences = jsonb_set(
        coalesce(preferences, '{}'::jsonb),
        '{projects}',
        ${JSON.stringify(normalizedProjects)}::jsonb,
        true
      ),
      updated_at = now()
    where id = ${userId}::uuid
    returning preferences -> 'projects' as projects
  `;

  return parseCreatorProjects(rows[0]?.projects);
}

export async function syncProjectConversationName(input: {
  userId: string;
  projectId: string;
  projectName: string;
}) {
  await prisma.$executeRaw`
    update public.conversations
    set
      metadata = jsonb_set(metadata, '{projectName}', to_jsonb(${input.projectName}::text), true),
      updated_at = now()
    where user_id = ${input.userId}::uuid
      and metadata ->> 'projectId' = ${input.projectId}
  `;
}

export async function removeProjectFromConversations(userId: string, projectId: string) {
  await prisma.$executeRaw`
    update public.conversations
    set
      metadata = metadata - 'projectId' - 'projectName',
      updated_at = now()
    where user_id = ${userId}::uuid
      and metadata ->> 'projectId' = ${projectId}
  `;
}

export async function ensureProfileForAppUser(input: {
  id: string;
  email?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  plan?: ProfilePlan;
  preferences?: JsonObject;
}) {
  await prisma.$executeRaw`
    insert into auth.users (
      id,
      aud,
      role,
      email,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      ${input.id}::uuid,
      'authenticated',
      'authenticated',
      ${input.email ?? null},
      now(),
      ${jsonb({ provider: "innkwise", providers: ["innkwise"] })},
      ${jsonb({ full_name: input.fullName ?? null, avatar_url: input.avatarUrl ?? null })},
      now(),
      now()
    )
    on conflict (id) do update set
      email = coalesce(excluded.email, auth.users.email),
      raw_user_meta_data = auth.users.raw_user_meta_data || excluded.raw_user_meta_data,
      updated_at = now()
  `;

  return upsertProfile(input);
}

export async function upsertCreatorProfile(input: {
  userId: string;
  creatorName?: string | null;
  brandName?: string | null;
  tagline?: string | null;
  bio?: string | null;
  experienceLevel?: string | null;
  archetypes?: string[];
  goals?: JsonObject;
  niche?: JsonObject;
  audience?: JsonObject;
  platformPreferences?: JsonObject;
  writingPreferences?: JsonObject;
  aiControls?: JsonObject;
  memory?: JsonObject;
}) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    insert into public.creator_profiles (
      user_id,
      creator_name,
      brand_name,
      tagline,
      bio,
      experience_level,
      archetypes,
      goals,
      niche,
      audience,
      platform_preferences,
      writing_preferences,
      ai_controls,
      memory
    )
    values (
      ${input.userId}::uuid,
      ${input.creatorName ?? null},
      ${input.brandName ?? null},
      ${input.tagline ?? null},
      ${input.bio ?? null},
      ${input.experienceLevel ?? null},
      ${textArray(input.archetypes)},
      ${jsonb(input.goals)},
      ${jsonb(input.niche)},
      ${jsonb(input.audience)},
      ${jsonb(input.platformPreferences)},
      ${jsonb(input.writingPreferences)},
      ${jsonb(input.aiControls)},
      ${jsonb(input.memory)}
    )
    on conflict (user_id) do update set
      creator_name = excluded.creator_name,
      brand_name = excluded.brand_name,
      tagline = excluded.tagline,
      bio = excluded.bio,
      experience_level = excluded.experience_level,
      archetypes = excluded.archetypes,
      goals = excluded.goals,
      niche = excluded.niche,
      audience = excluded.audience,
      platform_preferences = excluded.platform_preferences,
      writing_preferences = excluded.writing_preferences,
      ai_controls = excluded.ai_controls,
      memory = excluded.memory
    returning *
  `;

  return mapCreatorProfile(rows[0]);
}

export async function mergeCreatorMemory(input: {
  userId: string;
  goals?: JsonObject;
  niche?: JsonObject;
  audience?: JsonObject;
  platformPreferences?: JsonObject;
  writingPreferences?: JsonObject;
  memory?: JsonObject;
}) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    insert into public.creator_profiles (
      user_id,
      goals,
      niche,
      audience,
      platform_preferences,
      writing_preferences,
      memory
    )
    values (
      ${input.userId}::uuid,
      ${jsonb(input.goals)},
      ${jsonb(input.niche)},
      ${jsonb(input.audience)},
      ${jsonb(input.platformPreferences)},
      ${jsonb(input.writingPreferences)},
      ${jsonb(input.memory)}
    )
    on conflict (user_id) do update set
      goals = creator_profiles.goals || excluded.goals,
      niche = creator_profiles.niche || excluded.niche,
      audience = creator_profiles.audience || excluded.audience,
      platform_preferences = creator_profiles.platform_preferences || excluded.platform_preferences,
      writing_preferences = creator_profiles.writing_preferences || excluded.writing_preferences,
      memory = creator_profiles.memory || excluded.memory
    returning *
  `;

  return mapCreatorProfile(rows[0]);
}

export async function createKnowledgeSource(input: {
  userId: string;
  sourceType: KnowledgeSourceType;
  title: string;
  url?: string | null;
  storageBucket?: string | null;
  storagePath?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  metadata?: JsonObject;
  tags?: string[];
}) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    insert into public.knowledge_sources (
      user_id, source_type, title, url, storage_bucket, storage_path, mime_type, size_bytes, metadata, tags
    )
    values (
      ${input.userId}::uuid,
      ${input.sourceType},
      ${input.title},
      ${input.url ?? null},
      ${input.storageBucket ?? null},
      ${input.storagePath ?? null},
      ${input.mimeType ?? null},
      ${input.sizeBytes ?? null},
      ${jsonb(input.metadata)},
      ${textArray(input.tags)}
    )
    returning *
  `;

  return mapKnowledgeSource(rows[0]);
}

export async function listKnowledgeSources(userId: string, limit = 100) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    select * from public.knowledge_sources
    where user_id = ${userId}::uuid
    order by created_at desc
    limit ${limit}
  `;

  return rows.map(mapKnowledgeSource);
}

export async function deleteKnowledgeSource(userId: string, id: string) {
  await prisma.$executeRaw`
    delete from public.knowledge_sources
    where user_id = ${userId}::uuid and id = ${id}::uuid
  `;
}

export async function createConversation(input: {
  userId: string;
  title?: string | null;
  contextSnapshot?: JsonObject;
  memoryState?: JsonObject;
  metadata?: JsonObject;
}) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    insert into public.conversations (user_id, title, context_snapshot, memory_state, metadata)
    values (${input.userId}::uuid, ${input.title ?? null}, ${jsonb(input.contextSnapshot)}, ${jsonb(input.memoryState)}, ${jsonb(input.metadata)})
    returning *
  `;

  return {
    id: String(rows[0].id),
    userId: String(rows[0].user_id),
    title: rows[0].title ? String(rows[0].title) : null,
    status: String(rows[0].status),
    contextSnapshot: (rows[0].context_snapshot ?? emptyJson) as JsonObject,
    memoryState: (rows[0].memory_state ?? emptyJson) as JsonObject,
    metadata: (rows[0].metadata ?? emptyJson) as JsonObject,
    createdAt: iso(rows[0].created_at),
    updatedAt: iso(rows[0].updated_at)
  };
}

export async function getConversationState(userId: string, conversationId: string) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    select id, context_snapshot, memory_state, metadata
    from public.conversations
    where id = ${conversationId}::uuid
      and user_id = ${userId}::uuid
      and status = 'active'
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;

  return {
    id: String(row.id),
    contextSnapshot: (row.context_snapshot ?? emptyJson) as JsonObject,
    memoryState: (row.memory_state ?? emptyJson) as JsonObject,
    metadata: (row.metadata ?? emptyJson) as JsonObject
  };
}

export async function getLatestConversation(userId: string) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    select id, title, context_snapshot, memory_state, metadata, created_at, updated_at
    from public.conversations
    where user_id = ${userId}::uuid
      and status = 'active'
    order by updated_at desc, created_at desc
    limit 1
  `;

  const row = rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    title: row.title ? String(row.title) : null,
    contextSnapshot: (row.context_snapshot ?? emptyJson) as JsonObject,
    memoryState: (row.memory_state ?? emptyJson) as JsonObject,
    metadata: (row.metadata ?? emptyJson) as JsonObject,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

export async function listConversations(input: {
  userId: string;
  search?: string;
  limit?: number;
}) {
  const search = input.search?.trim() ?? "";
  const searchPattern = `%${search}%`;
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const rows = await prisma.$queryRaw<DbRow[]>`
    select
      conversations.id,
      conversations.title,
      conversations.metadata,
      conversations.created_at,
      conversations.updated_at,
      (
        select messages.content
        from public.messages
        where messages.conversation_id = conversations.id
          and messages.user_id = conversations.user_id
        order by messages.created_at desc
        limit 1
      ) as last_message
    from public.conversations
    where conversations.user_id = ${input.userId}::uuid
      and conversations.status = 'active'
      and (
        ${search} = ''
        or coalesce(conversations.title, '') ilike ${searchPattern}
        or exists (
          select 1
          from public.messages
          where messages.conversation_id = conversations.id
            and messages.user_id = conversations.user_id
            and coalesce(messages.content, '') ilike ${searchPattern}
        )
      )
    order by
      case when conversations.metadata ->> 'pinned' = 'true' then 0 else 1 end,
      conversations.updated_at desc,
      conversations.created_at desc
    limit ${limit}
  `;

  return rows.map((row) => {
    const metadata = (row.metadata ?? emptyJson) as JsonObject;
    return {
      id: String(row.id),
      title: row.title ? String(row.title) : "New conversation",
      lastMessage: row.last_message ? String(row.last_message) : null,
      isPinned: metadata.pinned === true,
      projectId: typeof metadata.projectId === "string" ? metadata.projectId : null,
      projectName: typeof metadata.projectName === "string" ? metadata.projectName : null,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at)
    };
  });
}

export async function updateConversationState(input: {
  userId: string;
  conversationId: string;
  contextSnapshot?: JsonObject;
  memoryState?: JsonObject;
  metadata?: JsonObject;
}) {
  await prisma.$executeRaw`
    update public.conversations
    set
      context_snapshot = context_snapshot || ${jsonb(input.contextSnapshot)},
      memory_state = memory_state || ${jsonb(input.memoryState)},
      metadata = metadata || ${jsonb(input.metadata)},
      updated_at = now()
    where id = ${input.conversationId}::uuid
      and user_id = ${input.userId}::uuid
  `;
}

export async function updateConversationTitle(input: {
  userId: string;
  conversationId: string;
  title: string;
}) {
  await prisma.$executeRaw`
    update public.conversations
    set title = ${input.title}, updated_at = now()
    where id = ${input.conversationId}::uuid
      and user_id = ${input.userId}::uuid
  `;
}

export async function updateConversation(input: {
  userId: string;
  conversationId: string;
  title?: string;
  status?: "active" | "archived";
  metadata?: JsonObject;
}) {
  await prisma.$executeRaw`
    update public.conversations
    set
      title = case when ${input.title ?? null}::text is null then title else ${input.title ?? null} end,
      status = case when ${input.status ?? null}::text is null then status else ${input.status ?? null} end,
      metadata = metadata || ${jsonb(input.metadata)},
      updated_at = now()
    where id = ${input.conversationId}::uuid
      and user_id = ${input.userId}::uuid
  `;
}

export async function deleteConversation(userId: string, conversationId: string) {
  await prisma.$executeRaw`
    delete from public.conversations
    where id = ${conversationId}::uuid
      and user_id = ${userId}::uuid
  `;
}

export async function getSharedConversation(shareToken: string) {
  const conversations = await prisma.$queryRaw<DbRow[]>`
    select id, title, created_at, updated_at
    from public.conversations
    where metadata ->> 'shareToken' = ${shareToken}
      and status = 'active'
    limit 1
  `;
  const conversation = conversations[0];
  if (!conversation) return null;

  const messages = await prisma.$queryRaw<DbRow[]>`
    select id, role, content, content_json, created_at
    from public.messages
    where conversation_id = ${String(conversation.id)}::uuid
      and role in ('user', 'assistant')
    order by created_at asc
  `;

  return {
    id: String(conversation.id),
    title: conversation.title ? String(conversation.title) : "Shared conversation",
    createdAt: iso(conversation.created_at),
    updatedAt: iso(conversation.updated_at),
    messages: messages.map(mapMessage)
  };
}

export async function addMessage(input: {
  userId: string;
  conversationId: string;
  role: MessageRole;
  content?: string | null;
  contentJson?: JsonObject;
  attachments?: unknown[];
  tokenCount?: number;
  metadata?: JsonObject;
}) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    insert into public.messages (user_id, conversation_id, role, content, content_json, attachments, token_count, metadata)
    values (
      ${input.userId}::uuid,
      ${input.conversationId}::uuid,
      ${input.role},
      ${input.content ?? null},
      ${jsonb(input.contentJson)},
      ${jsonb(input.attachments ?? [])},
      ${input.tokenCount ?? 0},
      ${jsonb(input.metadata)}
    )
    returning *
  `;

  return mapMessage(rows[0]);
}

export async function touchConversation(userId: string, conversationId: string) {
  await prisma.$executeRaw`
    update public.conversations
    set updated_at = now()
    where id = ${conversationId}::uuid
      and user_id = ${userId}::uuid
  `;
}

export async function listMessages(conversationId: string) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    select * from public.messages
    where conversation_id = ${conversationId}::uuid
    order by created_at asc
  `;

  return rows.map(mapMessage);
}

export async function listConversationMessages(userId: string, conversationId: string) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    select *
    from public.messages
    where user_id = ${userId}::uuid
      and conversation_id = ${conversationId}::uuid
    order by created_at asc
  `;

  return rows.map(mapMessage);
}

export async function createGeneratedAsset(input: {
  userId: string;
  conversationId?: string | null;
  sourceMessageId?: string | null;
  assetType: GeneratedAssetType;
  title?: string | null;
  prompt?: string | null;
  outputText?: string | null;
  outputJson?: JsonObject;
  model?: string | null;
  parameters?: JsonObject;
  sourceContext?: JsonObject;
  metadata?: JsonObject;
}) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    insert into public.generated_assets (
      user_id,
      conversation_id,
      source_message_id,
      asset_type,
      title,
      prompt,
      output_text,
      output_json,
      model,
      parameters,
      source_context,
      metadata
    )
    values (
      ${input.userId}::uuid,
      ${input.conversationId ?? null}::uuid,
      ${input.sourceMessageId ?? null}::uuid,
      ${input.assetType},
      ${input.title ?? null},
      ${input.prompt ?? null},
      ${input.outputText ?? null},
      ${jsonb(input.outputJson)},
      ${input.model ?? null},
      ${jsonb(input.parameters)},
      ${jsonb(input.sourceContext)},
      ${jsonb(input.metadata)}
    )
    returning *
  `;

  return mapGeneratedAsset(rows[0]);
}

export async function listGeneratedAssets(userId: string, limit = 50) {
  const rows = await prisma.$queryRaw<DbRow[]>`
    select * from public.generated_assets
    where user_id = ${userId}::uuid
    order by created_at desc
    limit ${limit}
  `;

  return rows.map(mapGeneratedAsset);
}

export async function incrementUsageMetric(input: {
  userId: string;
  periodKey: string;
  periodStart: string;
  metric: UsageMetric;
  count?: number;
  creditsUsed?: number;
  metadata?: JsonObject;
}) {
  await prisma.$executeRaw`
    insert into public.usage (user_id, period_key, period_start, metric, count, credits_used, metadata)
    values (
      ${input.userId}::uuid,
      ${input.periodKey},
      ${input.periodStart}::date,
      ${input.metric},
      ${input.count ?? 1},
      ${input.creditsUsed ?? 0},
      ${jsonb(input.metadata)}
    )
    on conflict (user_id, period_key, metric) do update set
      count = public.usage.count + excluded.count,
      credits_used = public.usage.credits_used + excluded.credits_used,
      metadata = public.usage.metadata || excluded.metadata
  `;
}
