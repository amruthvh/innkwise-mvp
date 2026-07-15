import type { ContextWorkflow } from "@/backend/context/context-engine";
import { workflowSchema } from "@/lib/validation/ValidationSchemas";
import { InputValidationError } from "@/lib/validation/ValidationErrors";

export type PublicWorkflow = ContextWorkflow | "posting";

export class WorkflowValidator {
  validate(value: unknown): ContextWorkflow {
    const parsed = workflowSchema.safeParse(value ?? "general");
    if (!parsed.success) {
      throw new InputValidationError("INVALID_WORKFLOW", "Unknown workflow type.");
    }

    return parsed.data === "posting" ? "distribution" : parsed.data;
  }
}

export const workflowValidator = new WorkflowValidator();
