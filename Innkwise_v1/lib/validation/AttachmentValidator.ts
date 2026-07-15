import { z } from "zod";
import { sanitizer } from "@/lib/validation/Sanitizer";
import { attachmentSchema } from "@/lib/validation/ValidationSchemas";
import { InputValidationError } from "@/lib/validation/ValidationErrors";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_FILES_PER_CONVERSATION = 5;
const allowedExtensions = new Set(["pdf", "docx", "txt", "md"]);
const blockedExtensions = new Set(["exe", "bat", "js", "zip", "html", "htm", "cmd", "sh", "msi"]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown"
]);

export type ValidatedAttachment = z.infer<typeof attachmentSchema>;

function extensionFor(name: string) {
  const normalized = name.toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index + 1) : "";
}

export class AttachmentValidator {
  validateMany(value: unknown): ValidatedAttachment[] {
    const parsed = z.array(attachmentSchema).max(MAX_FILES_PER_CONVERSATION).safeParse(value ?? []);
    if (!parsed.success) {
      throw new InputValidationError("INVALID_ATTACHMENT", "Please attach no more than 5 valid files.", parsed.error.flatten());
    }

    return parsed.data.map((attachment) => this.validateOne(attachment));
  }

  validateOne(attachment: ValidatedAttachment): ValidatedAttachment {
    const name = sanitizer.sanitizeShortText(attachment.name);
    const extension = extensionFor(name);
    const mimeType = attachment.mimeType?.toLowerCase();

    if (!name || !extension) {
      throw new InputValidationError("INVALID_ATTACHMENT", "Attached files must include a valid file name.");
    }

    if (blockedExtensions.has(extension) || !allowedExtensions.has(extension)) {
      throw new InputValidationError("INVALID_ATTACHMENT", "This file type is not supported. Please upload PDF, DOCX, TXT, or MD files.");
    }

    if (mimeType && !allowedMimeTypes.has(mimeType)) {
      throw new InputValidationError("INVALID_ATTACHMENT", "This file type is not supported. Please upload PDF, DOCX, TXT, or MD files.");
    }

    if (typeof attachment.size === "number" && attachment.size > MAX_FILE_SIZE_BYTES) {
      throw new InputValidationError("INVALID_ATTACHMENT", "Files must be 20 MB or smaller.");
    }

    return {
      ...attachment,
      name,
      mimeType
    };
  }
}

export const attachmentValidator = new AttachmentValidator();
