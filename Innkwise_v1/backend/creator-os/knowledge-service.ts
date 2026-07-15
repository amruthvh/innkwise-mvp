import {
  deleteKnowledgeObject,
  getKnowledgeObjectUrl,
  uploadKnowledgeObject
} from "@/backend/supabase/client";
import {
  createKnowledgeSource,
  deleteKnowledgeSource,
  listKnowledgeSources
} from "@/backend/creator-os/crud-service";
import type { JsonObject, KnowledgeSourceType } from "@/shared/types/creator-os";

function inferSourceType(mimeType?: string | null): KnowledgeSourceType {
  if (!mimeType) return "file";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  return "file";
}

function base64ToBuffer(contentBase64: string) {
  return Buffer.from(contentBase64, "base64");
}

export async function createLinkKnowledgeSource(input: {
  userId: string;
  title: string;
  url: string;
  sourceType?: KnowledgeSourceType;
  metadata?: JsonObject;
  tags?: string[];
}) {
  return createKnowledgeSource({
    userId: input.userId,
    sourceType: input.sourceType ?? "link",
    title: input.title,
    url: input.url,
    metadata: input.metadata,
    tags: input.tags
  });
}

export async function uploadFileKnowledgeSource(input: {
  userId: string;
  title: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  contentBase64: string;
  sourceType?: KnowledgeSourceType;
  metadata?: JsonObject;
  tags?: string[];
}) {
  const body = base64ToBuffer(input.contentBase64);
  const upload = await uploadKnowledgeObject({
    userId: input.userId,
    fileName: input.fileName,
    contentType: input.mimeType ?? "application/octet-stream",
    body
  });

  return createKnowledgeSource({
    userId: input.userId,
    sourceType: input.sourceType ?? inferSourceType(input.mimeType),
    title: input.title,
    storageBucket: upload.bucket,
    storagePath: upload.path,
    mimeType: input.mimeType ?? null,
    sizeBytes: input.sizeBytes ?? body.byteLength,
    metadata: {
      ...(input.metadata ?? {}),
      storageUrl: getKnowledgeObjectUrl(upload.path, upload.bucket)
    },
    tags: input.tags
  });
}

export async function listRecentKnowledgeSources(userId: string, limit = 25) {
  return listKnowledgeSources(userId, limit);
}

export async function removeKnowledgeSource(input: {
  userId: string;
  id: string;
  storagePath?: string | null;
  storageBucket?: string | null;
}) {
  if (input.storagePath) {
    await deleteKnowledgeObject(input.storagePath, input.storageBucket ?? undefined);
  }

  await deleteKnowledgeSource(input.userId, input.id);
}
