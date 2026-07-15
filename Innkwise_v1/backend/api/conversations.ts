import type { NextApiResponse } from "next";
import {
  deleteConversation,
  ensureProfileForAppUser,
  listCreatorProjects,
  listConversations,
  updateConversation
} from "@/backend/creator-os/crud-service";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";
import { verifyConversationOwnership } from "@/lib/auth/authorization";
import { isApiError, ValidationError } from "@/lib/auth/errors";
import type { JsonObject } from "@/shared/types/creator-os";

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  try {
    await ensureProfileForAppUser({
      id: req.auth.id,
      email: req.auth.email
    });

    if (req.method === "GET") {
      const search = typeof req.query.search === "string" ? req.query.search : "";
      const conversations = await listConversations({
        userId: req.auth.id,
        search,
        limit: 150
      });

      return res.status(200).json({ conversations });
    }

    if (req.method === "PATCH") {
      const body = req.body as {
        id?: string;
        action?: string;
        title?: string;
        pinned?: boolean;
        projectId?: string | null;
        projectName?: string | null;
      };
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) throw new ValidationError("Conversation id is required.");
      await verifyConversationOwnership(req.auth.id, id);

      if (body.action === "rename") {
        const title = String(body.title ?? "").trim();
        if (!title) throw new ValidationError("Conversation title is required.");
        await updateConversation({ userId: req.auth.id, conversationId: id, title: title.slice(0, 100) });
      } else if (body.action === "pin") {
        await updateConversation({
          userId: req.auth.id,
          conversationId: id,
          metadata: { pinned: Boolean(body.pinned) }
        });
      } else if (body.action === "move") {
        if (typeof body.projectId === "string") {
          const projects = await listCreatorProjects(req.auth.id);
          const project = projects.find((item) => item.id === body.projectId);
          if (!project) return res.status(404).json({ error: "Project not found." });
          body.projectName = project.name;
        }
        const metadata: JsonObject = {
          projectId: typeof body.projectId === "string" ? body.projectId : null,
          projectName: typeof body.projectName === "string" ? body.projectName : null
        };
        await updateConversation({ userId: req.auth.id, conversationId: id, metadata });
      } else if (body.action === "archive") {
        await updateConversation({ userId: req.auth.id, conversationId: id, status: "archived" });
      } else if (body.action === "share") {
        const shareToken = crypto.randomUUID();
        await updateConversation({
          userId: req.auth.id,
          conversationId: id,
          metadata: { shareToken }
        });
        return res.status(200).json({ ok: true, shareToken });
      } else {
        return res.status(400).json({ error: "Unsupported conversation action." });
      }

      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const id = typeof req.body?.id === "string" ? req.body.id : "";
      if (!id) throw new ValidationError("Conversation id is required.");
      await verifyConversationOwnership(req.auth.id, id);
      await deleteConversation(req.auth.id, id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (isApiError(error)) throw error;
    const message = error instanceof Error ? error.message : "Unable to load conversations.";
    console.error("[conversations] request failed", error);
    return res.status(500).json({ error: message });
  }
}

export default withApiAuth(handler);
