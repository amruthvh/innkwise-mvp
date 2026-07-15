import { prisma } from "@/database/prisma/client";
import { rateLimiter } from "@/lib/rate-limit/RateLimiter";
import type { EmbeddingModel, EmbeddingVector } from "@/lib/retrieval/types";

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModel = "BAAI/bge-small-en-v1.5";
export const EMBEDDING_DIMENSIONS = 384;

type EmbeddingInputKind = "query" | "passage";

type KnowledgeSourceEmbeddingRow = {
  id: string;
  user_id: string;
  title: string;
  summary: string | null;
  extracted_text: string | null;
  url: string | null;
  metadata: unknown;
};

function getHuggingFaceToken() {
  const token = process.env.HF_API_TOKEN;
  if (!token) {
    throw new Error("HF_API_TOKEN is required to generate embeddings.");
  }

  return token;
}

function buildEmbeddingText(text: string, kind: EmbeddingInputKind) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const prefix = kind === "query"
    ? "Represent this sentence for searching relevant passages:"
    : "Represent this passage for retrieval:";

  return `${prefix} ${cleaned}`;
}

function flattenEmbeddingResponse(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new Error("Embedding response was not an array.");
  }

  if (value.every((item) => typeof item === "number")) {
    return value as number[];
  }

  if (value.every((item) => Array.isArray(item))) {
    const rows = value as unknown[][];
    const numericRows = rows
      .map((row) => row.filter((item): item is number => typeof item === "number"))
      .filter((row) => row.length > 0);

    if (!numericRows.length) {
      throw new Error("Embedding response did not contain numeric vectors.");
    }

    const dimensions = numericRows[0].length;
    const pooled = Array.from({ length: dimensions }, (_, index) => {
      const sum = numericRows.reduce((total, row) => total + (row[index] ?? 0), 0);
      return sum / numericRows.length;
    });

    return pooled;
  }

  throw new Error("Unsupported embedding response shape.");
}

function normalizeVector(vector: number[]) {
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Expected ${EMBEDDING_DIMENSIONS} embedding dimensions, received ${vector.length}.`);
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    throw new Error("Embedding vector magnitude is invalid.");
  }

  return vector.map((value) => value / magnitude);
}

export function toVectorLiteral(vector: EmbeddingVector) {
  return `[${vector.map((value) => {
    if (!Number.isFinite(value)) {
      throw new Error("Embedding vector contains a non-finite value.");
    }

    return Number(value).toFixed(8);
  }).join(",")}]`;
}

export async function generateEmbedding(
  text: string,
  kind: EmbeddingInputKind = "passage",
  options: { userId?: string } = {}
): Promise<EmbeddingVector> {
  const input = buildEmbeddingText(text, kind);
  if (!input.trim()) {
    throw new Error("Cannot generate an embedding for empty text.");
  }

  if (options.userId) {
    await rateLimiter.checkQuota({
      userId: options.userId,
      operation: "embedding_generation",
      prompt: text
    });
  }

  const startedAt = Date.now();
  const response = await fetch(`https://api-inference.huggingface.co/pipeline/feature-extraction/${DEFAULT_EMBEDDING_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getHuggingFaceToken()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      inputs: input,
      options: {
        wait_for_model: true
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Embedding generation failed.");
  }

  const raw = await response.json();
  const embedding = normalizeVector(flattenEmbeddingResponse(raw));

  if (options.userId) {
    await rateLimiter.consumeQuota({
      userId: options.userId,
      operation: "embedding_generation",
      latencyMs: Date.now() - startedAt
    });
  }

  return embedding;
}

function buildSourceEmbeddingText(source: KnowledgeSourceEmbeddingRow) {
  return [
    source.title,
    source.summary,
    source.extracted_text,
    source.url,
    typeof source.metadata === "object" && source.metadata ? JSON.stringify(source.metadata) : null
  ]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join("\n\n")
    .slice(0, 8000);
}

export async function storeEmbedding(sourceId: string): Promise<EmbeddingVector> {
  const rows = await prisma.$queryRaw<KnowledgeSourceEmbeddingRow[]>`
    select id, user_id, title, summary, extracted_text, url, metadata
    from public.knowledge_sources
    where id = ${sourceId}::uuid
    limit 1
  `;
  const source = rows[0];
  if (!source) {
    throw new Error("Knowledge source not found.");
  }

  const embedding = await generateEmbedding(buildSourceEmbeddingText(source), "passage", {
    userId: source.user_id
  });
  const vectorLiteral = toVectorLiteral(embedding);

  await prisma.$executeRaw`
    update public.knowledge_sources
    set
      embedding = ${vectorLiteral}::vector,
      embedding_metadata = embedding_metadata || ${JSON.stringify({
        model: DEFAULT_EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        embeddedAt: new Date().toISOString(),
        granularity: "document"
      })}::jsonb
    where id = ${sourceId}::uuid
  `;

  return embedding;
}
