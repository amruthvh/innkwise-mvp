import { prisma } from "@/database/prisma/client";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/auth/errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new ValidationError(`${label} must be a valid UUID.`);
  }
}

function assertOwnership(resource: { userId: string } | null, userId: string, notFoundMessage: string) {
  if (!resource) throw new NotFoundError(notFoundMessage);
  if (resource.userId !== userId) throw new ForbiddenError();
}

export async function verifyConversationOwnership(userId: string, conversationId: string) {
  assertUuid(conversationId, "Conversation id");

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, userId: true }
  });

  assertOwnership(conversation, userId, "Conversation not found.");
  return conversation;
}

export async function verifyKnowledgeOwnership(userId: string, knowledgeSourceId: string) {
  assertUuid(knowledgeSourceId, "Knowledge source id");

  const knowledgeSource = await prisma.knowledgeSource.findUnique({
    where: { id: knowledgeSourceId },
    select: { id: true, userId: true }
  });

  assertOwnership(knowledgeSource, userId, "Knowledge source not found.");
  return knowledgeSource;
}

export async function verifyLibraryItemOwnership(userId: string, libraryItemId: string) {
  const libraryItem = await prisma.libraryItem.findUnique({
    where: { id: libraryItemId },
    select: { id: true, userId: true }
  });

  assertOwnership(libraryItem, userId, "Library item not found.");
  return libraryItem;
}

export async function verifyGeneratedAssetOwnership(userId: string, generatedAssetId: string) {
  assertUuid(generatedAssetId, "Generated asset id");

  const asset = await prisma.generatedAsset.findUnique({
    where: { id: generatedAssetId },
    select: { id: true, userId: true }
  });

  assertOwnership(asset, userId, "Generated asset not found.");
  return asset;
}

export async function verifyMessageOwnership(userId: string, messageId: string) {
  assertUuid(messageId, "Message id");

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, userId: true, conversationId: true }
  });

  assertOwnership(message, userId, "Message not found.");
  return message;
}
