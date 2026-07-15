import { quotaCalculator } from "@/lib/rate-limit/QuotaCalculator";
import { attachmentValidator } from "@/lib/validation/AttachmentValidator";
import { promptValidator } from "@/lib/validation/PromptValidator";
import { workflowValidator } from "@/lib/validation/WorkflowValidator";
import { chatRequestSchema, personalizationSchema, uuidSchema } from "@/lib/validation/ValidationSchemas";
import { InputValidationError } from "@/lib/validation/ValidationErrors";
import type { ContextWorkflow } from "@/backend/context/context-engine";

export type ValidatedChatRequest = {
  prompt: string;
  workflowType: ContextWorkflow;
  conversationId: string | null;
  attachments: ReturnType<typeof attachmentValidator.validateMany>;
};

export class InputValidator {
  async validateChatRequest(userId: string, value: unknown): Promise<ValidatedChatRequest> {
    const parsed = chatRequestSchema.safeParse(value);
    if (!parsed.success) {
      throw new InputValidationError("INVALID_REQUEST", "The chat request is malformed.", parsed.error.flatten());
    }

    const plan = await quotaCalculator.resolvePlan(userId);
    const prompt = promptValidator.validate(parsed.data.prompt, plan);
    const workflowType = workflowValidator.validate(parsed.data.workflowType);
    const attachments = attachmentValidator.validateMany(parsed.data.attachments);

    return {
      prompt,
      workflowType,
      conversationId: parsed.data.conversationId ?? null,
      attachments
    };
  }

  validateConversationId(value: unknown) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = uuidSchema.safeParse(value);
    if (!parsed.success) {
      throw new InputValidationError("INVALID_CONVERSATION", "Conversation id is invalid.");
    }
    return parsed.data;
  }

  validatePersonalization(value: unknown) {
    const parsed = personalizationSchema.safeParse(value);
    if (!parsed.success) {
      throw new InputValidationError("INVALID_PERSONALIZATION", "Personalization settings are malformed.", parsed.error.flatten());
    }
    return parsed.data;
  }
}

export const inputValidator = new InputValidator();
