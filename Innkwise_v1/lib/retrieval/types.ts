import type { JsonObject, KnowledgeSourceType } from "@/shared/types/creator-os";

export type EmbeddingVector = number[];

export type EmbeddingModel = "BAAI/bge-small-en-v1.5";

export type RelevantKnowledgeSource = {
  id: string;
  userId: string;
  sourceType: KnowledgeSourceType;
  title: string;
  url: string | null;
  summary: string | null;
  extractedTextSnippet: string | null;
  tags: string[];
  metadata: JsonObject;
  embeddingMetadata: JsonObject;
  similarity: number;
  distance: number;
  createdAt: string;
};

export type SemanticSearchOptions = {
  userId: string;
  limit?: number;
  minSimilarity?: number;
  selectedKnowledgeSourceIds?: string[];
  extractedTextSnippetChars?: number;
};
