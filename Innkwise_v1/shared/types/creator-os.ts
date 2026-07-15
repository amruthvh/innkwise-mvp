export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ProfilePlan = "FREE" | "CREATOR" | "PRO";

export type Profile = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  plan: ProfilePlan;
  stripeCustomerId: string | null;
  onboardingStatus: JsonObject;
  preferences: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type CreatorProfile = {
  id: string;
  userId: string;
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
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeSourceType =
  | "file"
  | "image"
  | "link"
  | "video"
  | "audio"
  | "pdf"
  | "research_paper"
  | "book"
  | "newsletter"
  | "blog"
  | "youtube_channel"
  | "website"
  | "other";

export type KnowledgeSource = {
  id: string;
  userId: string;
  sourceType: KnowledgeSourceType;
  title: string;
  description: string | null;
  url: string | null;
  storageBucket: string | null;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  extractionStatus: "pending" | "processing" | "completed" | "failed";
  extractedText: string | null;
  summary: string | null;
  tags: string[];
  metadata: JsonObject;
  embeddingMetadata: JsonObject;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConversationStatus = "active" | "archived" | "deleted";

export type Conversation = {
  id: string;
  userId: string;
  title: string | null;
  status: ConversationStatus;
  contextSnapshot: JsonObject;
  memoryState: JsonObject;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type Message = {
  id: string;
  userId: string;
  conversationId: string;
  role: MessageRole;
  content: string | null;
  contentJson: JsonObject;
  attachments: JsonValue[];
  tokenCount: number;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type GeneratedAssetType = "script" | "thumbnail" | "image" | "document" | "outline" | "post" | "email" | "other";
export type GeneratedAssetStatus = "queued" | "generating" | "completed" | "failed" | "archived";

export type GeneratedAsset = {
  id: string;
  userId: string;
  conversationId: string | null;
  sourceMessageId: string | null;
  assetType: GeneratedAssetType;
  title: string | null;
  prompt: string | null;
  outputText: string | null;
  outputJson: JsonObject;
  model: string | null;
  parameters: JsonObject;
  sourceContext: JsonObject;
  status: GeneratedAssetStatus;
  storageBucket: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type UsageMetric =
  | "message"
  | "generation"
  | "storage_mb"
  | "knowledge_source"
  | "asset"
  | "token"
  | "ai_generation"
  | "prompt_token"
  | "completion_token"
  | "embedding"
  | "upload"
  | "latency_ms"
  | "failed_request"
  | "blocked_request";

export type UsageRecord = {
  id: string;
  userId: string;
  periodKey: string;
  periodStart: string;
  metric: UsageMetric;
  count: number;
  creditsUsed: number;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
};

export type ContextAssemblyInput = {
  userId: string;
  conversationId?: string;
  topic?: string;
  selectedKnowledgeSourceIds?: string[];
  requestedAssetType?: GeneratedAssetType;
  metadata?: JsonObject;
};
