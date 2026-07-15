import type { NextApiResponse } from "next";
import { prisma } from "@/database/prisma/client";
import {
  createLocalLibraryItem,
  deleteLocalLibraryItems,
  listLocalLibraryItems,
  updateLocalLibraryItem
} from "@/database/local/local-library-repository";
import { withApiAuth, type AuthenticatedApiRequest } from "@/lib/auth/auth-middleware";
import { verifyLibraryItemOwnership } from "@/lib/auth/authorization";
import { isApiError, ValidationError } from "@/lib/auth/errors";
import { rateLimiter } from "@/lib/rate-limit/RateLimiter";
import { isRateLimitError } from "@/lib/rate-limit/RateLimitErrors";
import { attachmentValidator } from "@/lib/validation/AttachmentValidator";
import { sanitizer } from "@/lib/validation/Sanitizer";
import { urlValidator } from "@/lib/validation/URLValidator";
import { InputValidationError, isInputValidationError } from "@/lib/validation/ValidationErrors";

type LibraryItemKind = "Images" | "Links" | "Files";

type CreateLibraryItemBody = {
  kind?: LibraryItemKind;
  name?: string;
  url?: string;
  mimeType?: string;
  size?: number;
  contentBase64?: string;
};

type DeleteLibraryItemsBody = {
  ids?: string[];
};

type UpdateLibraryItemBody = {
  id?: string;
  isFavorite?: boolean;
};

const MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
const blockedUploadExtensions = /\.(?:exe|bat|js|zip|html?|cmd|sh|msi)$/i;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "15mb"
    }
  }
};

async function handler(req: AuthenticatedApiRequest, res: NextApiResponse) {
  try {
    const userId = req.auth.id;

    if (req.method === "GET") {
      const items = await listLibraryItems(userId);

      return res.status(200).json({ items });
    }

    if (req.method === "POST") {
      const body = req.body as CreateLibraryItemBody;
      const kind = normalizeLibraryKind(body.kind, body.mimeType);
      const name = sanitizer.sanitizeShortText(body.name);

      if (!name) {
        return res.status(400).json({ error: "Library item name is required." });
      }

      const normalizedUrl = kind === "Links"
        ? urlValidator.normalize(body.url ?? "", { allowAnyWebsite: true })
        : null;

      if (kind !== "Links" && !body.contentBase64) {
        return res.status(400).json({ error: "File content is required." });
      }

      if (kind === "Files") {
        attachmentValidator.validateOne({
          name,
          mimeType: body.mimeType,
          size: body.size
        });
      }

      if (kind === "Images") {
        if (blockedUploadExtensions.test(name)) {
          throw new InputValidationError("INVALID_ATTACHMENT", "This file type is not supported.");
        }
        if (typeof body.size === "number" && body.size > MAX_UPLOAD_SIZE_BYTES) {
          throw new InputValidationError("INVALID_ATTACHMENT", "Files must be 20 MB or smaller.");
        }
        if (body.mimeType && !body.mimeType.startsWith("image/")) {
          throw new InputValidationError("INVALID_ATTACHMENT", "Only image files are allowed here.");
        }
      }

      if (kind !== "Links") {
        await rateLimiter.checkQuota({
          userId,
          operation: "file_upload",
          prompt: name
        });
      }

      const item = await createLibraryItem({
        userId,
        kind,
        name,
        url: normalizedUrl,
        mimeType: body.mimeType?.trim() || null,
        size: typeof body.size === "number" && Number.isFinite(body.size) ? Math.round(body.size) : null,
        contentBase64: body.contentBase64 || null,
        isFavorite: false
      });

      if (kind !== "Links") {
        await rateLimiter.consumeQuota({
          userId,
          operation: "file_upload"
        });
      }

      return res.status(201).json({ item });
    }

    if (req.method === "PATCH") {
      const body = req.body as UpdateLibraryItemBody;
      const id = typeof body.id === "string" ? body.id : "";

      if (!id) {
        throw new ValidationError("Library item id is required.");
      }

      await verifyLibraryItemOwnership(userId, id);
      const item = await updateLibraryItem(userId, id, {
        isFavorite: Boolean(body.isFavorite)
      });

      return res.status(200).json({ item });
    }

    if (req.method === "DELETE") {
      const body = req.body as DeleteLibraryItemsBody;
      const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : [];

      if (!ids.length) {
        throw new ValidationError("At least one library item id is required.");
      }

      await Promise.all(ids.map((id) => verifyLibraryItemOwnership(userId, id)));
      await deleteLibraryItems(userId, ids);

      return res.status(200).json({ deletedIds: ids });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (isApiError(error)) throw error;
    if (isRateLimitError(error)) {
      return res.status(200).json(error.toResponse());
    }
    if (isInputValidationError(error)) {
      return res.status(400).json(error.toResponse());
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    return res.status(401).json({ error: message });
  }
}

export default withApiAuth(handler);

async function listLibraryItems(userId: string) {
  try {
    return await prisma.libraryItem.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 200
    });
  } catch {
    return listLocalLibraryItems(userId);
  }
}

async function createLibraryItem(input: {
  userId: string;
  kind: LibraryItemKind;
  name: string;
  url: string | null;
  mimeType: string | null;
  size: number | null;
  contentBase64: string | null;
  isFavorite: boolean;
}) {
  try {
    return await prisma.libraryItem.create({ data: input });
  } catch {
    return createLocalLibraryItem(input);
  }
}

async function updateLibraryItem(
  userId: string,
  id: string,
  data: { isFavorite: boolean }
) {
  try {
    await prisma.libraryItem.updateMany({
      where: { id, userId },
      data
    });
    return await prisma.libraryItem.findFirst({ where: { id, userId } });
  } catch {
    return updateLocalLibraryItem(userId, id, data);
  }
}

async function deleteLibraryItems(userId: string, ids: string[]) {
  try {
    await prisma.libraryItem.deleteMany({
      where: {
        userId,
        id: { in: ids }
      }
    });
  } catch {
    deleteLocalLibraryItems(userId, ids);
  }
}

function normalizeLibraryKind(kind?: string, mimeType?: string): LibraryItemKind {
  if (kind === "Links" || kind === "Images" || kind === "Files") return kind;
  if (mimeType?.startsWith("image/")) return "Images";
  return "Files";
}
