import type { NextApiResponse } from "next";
import { hasFeature } from "@/backend/billing/features";
import { getSubscriptionSummary } from "@/backend/billing/subscription";
import {
  ensureProfileForAppUser,
  listCreatorProjects,
  removeProjectFromConversations,
  saveCreatorProjects,
  syncProjectConversationName,
  type CreatorProject
} from "@/backend/creator-os/crud-service";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";
import { isApiError } from "@/lib/auth/errors";

function cleanProject(value: unknown): CreatorProject | null {
  if (!value || typeof value !== "object") return null;
  const project = value as Record<string, unknown>;
  const name = typeof project.name === "string" ? project.name.trim() : "";
  if (!name) return null;

  return {
    id: typeof project.id === "string" && project.id
      ? project.id
      : crypto.randomUUID(),
    name: name.slice(0, 100),
    instructions: typeof project.instructions === "string"
      ? project.instructions.trim().slice(0, 5000)
      : "",
    createdAt: typeof project.createdAt === "string"
      ? project.createdAt
      : new Date().toISOString()
  };
}

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");

  try {
    await ensureProfileForAppUser({ id: req.auth.id, email: req.auth.email });

    if (req.method === "GET") {
      return res.status(200).json({ projects: await listCreatorProjects(req.auth.id) });
    }

    if (req.method === "POST") {
      const project = cleanProject(req.body);
      if (!project) return res.status(400).json({ error: "Project name is required." });

      const projects = await listCreatorProjects(req.auth.id);
      const existingIndex = projects.findIndex((item) => item.id === project.id);
      const subscription = await getSubscriptionSummary(req.auth.id);

      if (existingIndex < 0 && projects.length >= 1 && !hasFeature(subscription, "UNLIMITED_PROJECTS")) {
        return res.status(402).json({
          error: "Upgrade to Creator to create unlimited projects.",
          feature: "UNLIMITED_PROJECTS"
        });
      }

      const nextProjects = existingIndex >= 0
        ? projects.map((item) => item.id === project.id ? project : item)
        : [project, ...projects];
      await saveCreatorProjects(req.auth.id, nextProjects);
      return res.status(201).json({ project });
    }

    if (req.method === "PATCH") {
      const project = cleanProject(req.body);
      if (!project) return res.status(400).json({ error: "Valid project details are required." });

      const projects = await listCreatorProjects(req.auth.id);
      if (!projects.some((item) => item.id === project.id)) {
        return res.status(404).json({ error: "Project not found." });
      }

      await saveCreatorProjects(
        req.auth.id,
        projects.map((item) => item.id === project.id ? project : item)
      );
      await syncProjectConversationName({
        userId: req.auth.id,
        projectId: project.id,
        projectName: project.name
      });
      return res.status(200).json({ project });
    }

    if (req.method === "DELETE") {
      const id = typeof req.body?.id === "string" ? req.body.id : "";
      if (!id) return res.status(400).json({ error: "Project id is required." });

      const projects = await listCreatorProjects(req.auth.id);
      await saveCreatorProjects(req.auth.id, projects.filter((project) => project.id !== id));
      await removeProjectFromConversations(req.auth.id, id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    if (isApiError(error)) throw error;
    const message = error instanceof Error ? error.message : "Unable to manage projects.";
    console.error("[projects] request failed", error);
    return res.status(500).json({ error: message });
  }
}

export default withApiAuth(handler);
