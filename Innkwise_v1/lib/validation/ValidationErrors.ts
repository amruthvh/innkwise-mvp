export type ValidationErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_PROMPT"
  | "INVALID_WORKFLOW"
  | "INVALID_CONVERSATION"
  | "INVALID_ATTACHMENT"
  | "INVALID_URL"
  | "INVALID_PERSONALIZATION";

export class InputValidationError extends Error {
  readonly code: ValidationErrorCode;
  readonly details?: unknown;

  constructor(code: ValidationErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "InputValidationError";
    this.code = code;
    this.details = details;
  }

  toResponse() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message
      }
    };
  }
}

export function isInputValidationError(error: unknown): error is InputValidationError {
  return error instanceof InputValidationError;
}
