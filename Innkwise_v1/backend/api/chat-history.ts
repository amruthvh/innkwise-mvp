import type { NextApiResponse } from "next";
import {
  ensureProfileForAppUser,
  getConversationState,
  getLatestConversation,
  listConversationMessages
} from "@/backend/creator-os/crud-service";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";
import { verifyConversationOwnership } from "@/lib/auth/authorization";
import { isApiError } from "@/lib/auth/errors";

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await ensureProfileForAppUser({
      id: req.auth.id,
      email: req.auth.email
    });

    const requestedConversationId = typeof req.query.conversationId === "string"
      ? req.query.conversationId
      : null;
    if (requestedConversationId) {
      await verifyConversationOwnership(req.auth.id, requestedConversationId);
    }
    const conversation = requestedConversationId
      ? await getConversationState(req.auth.id, requestedConversationId)
      : await getLatestConversation(req.auth.id);

    if (!conversation) {
      return res.status(200).json({ conversationId: null, messages: [] });
    }

    const messages = await listConversationMessages(req.auth.id, conversation.id);
    return res.status(200).json({
      conversationId: conversation.id,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        contentJson: message.contentJson,
        metadata: message.metadata,
        createdAt: message.createdAt
      }))
    });
  } catch (error) {
    if (isApiError(error)) throw error;
    const message = error instanceof Error ? error.message : "Unable to load conversation history.";
    console.error("[chat-history] request failed", error);
    return res.status(500).json({ error: message });
  }
}

export default withApiAuth(handler);
