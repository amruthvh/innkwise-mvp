import { Prisma } from "@prisma/client";
import { prisma } from "@/database/prisma/client";
import { generateEmbedding, toVectorLiteral } from "@/lib/embeddings/embedding-service";
import type { RelevantKnowledgeSource, SemanticSearchOptions } from "@/lib/retrieval/types";
import type { JsonObject, KnowledgeSourceType } from "@/shared/types/creator-os";

type RelevantKnowledgeSourceRow = {
  id: string;
  user_id: string;
  source_type: string;
  title: string;
  url: string | null;
  summary: string | null;
  extracted_text: string | null;
  tags: string[] | null;
  metadata: unknown;
  embedding_metadata: unknown;
  created_at: Date | string;
  distance: number;
};

const DEFAULT_RETRIEVAL_LIMIT = 5;
const DEFAULT_SNIPPET_CHARS = 1200;

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function truncate(value: string | null, maxChars: number) {
  if (!value?.trim()) return null;
  const cleaned = value.trim();
  return cleaned.length > maxChars ? `${cleaned.slice(0, maxChars).trim()}...` : cleaned;
}

function uuidListSql(ids: string[]) {
  return Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));
}

function mapRelevantKnowledgeSource(row: RelevantKnowledgeSourceRow, snippetChars: number): RelevantKnowledgeSource {
  const distance = Number(row.distance);
  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type as KnowledgeSourceType,
    title: row.title,
    url: row.url,
    summary: row.summary,
    extractedTextSnippet: truncate(row.extracted_text, snippetChars),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    metadata: asJsonObject(row.metadata),
    embeddingMetadata: asJsonObject(row.embedding_metadata),
    distance,
    similarity: 1 - distance,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
}

async function hasSearchableKnowledgeSources(input: {
  userId: string;
  selectedKnowledgeSourceIds?: string[];
}) {
  const selectedIds = input.selectedKnowledgeSourceIds?.filter(Boolean) ?? [];
  const selectedFilter = selectedIds.length
    ? Prisma.sql`and id in (${uuidListSql(selectedIds)})`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from public.knowledge_sources
      where user_id = ${input.userId}::uuid
        and embedding is not null
        and extraction_status <> 'failed'
        ${selectedFilter}
      limit 1
    ) as exists
  `;

  return Boolean(rows[0]?.exists);
}

export async function searchRelevantKnowledge(
  query: string,
  options: SemanticSearchOptions
): Promise<RelevantKnowledgeSource[]> {
  const cleanedQuery = query.trim();
  if (!cleanedQuery) return [];

  const limit = options.limit ?? DEFAULT_RETRIEVAL_LIMIT;
  const snippetChars = options.extractedTextSnippetChars ?? DEFAULT_SNIPPET_CHARS;
  const selectedIds = options.selectedKnowledgeSourceIds?.filter(Boolean) ?? [];
  const selectedFilter = selectedIds.length
    ? Prisma.sql`and id in (${uuidListSql(selectedIds)})`
    : Prisma.empty;
  const hasSearchableSources = await hasSearchableKnowledgeSources({
    userId: options.userId,
    selectedKnowledgeSourceIds: selectedIds
  });

  if (!hasSearchableSources) return [];

  const queryEmbedding = await generateEmbedding(cleanedQuery, "query", {
    userId: options.userId
  });
  const vectorLiteral = toVectorLiteral(queryEmbedding);
  const minSimilarityFilter = typeof options.minSimilarity === "number"
    ? Prisma.sql`and (1 - (embedding <=> ${vectorLiteral}::vector)) >= ${options.minSimilarity}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<RelevantKnowledgeSourceRow[]>`
    select
      id,
      user_id,
      source_type,
      title,
      url,
      summary,
      extracted_text,
      tags,
      metadata,
      embedding_metadata,
      created_at,
      embedding <=> ${vectorLiteral}::vector as distance
    from public.knowledge_sources
    where user_id = ${options.userId}::uuid
      and embedding is not null
      and extraction_status <> 'failed'
      ${selectedFilter}
      ${minSimilarityFilter}
    order by embedding <=> ${vectorLiteral}::vector asc
    limit ${limit}
  `;

  return rows.map((row) => mapRelevantKnowledgeSource(row, snippetChars));
}
