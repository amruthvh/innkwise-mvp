export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;

  constructor(code: ApiErrorCode, message: string, statusCode: number) {
    super(message);
    this.name = code;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Authentication is required.") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "You do not have permission to access this resource.") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found.") {
    super("NOT_FOUND", message, 404);
  }
}

export class ValidationError extends ApiError {
  constructor(message = "Invalid request.") {
    super("VALIDATION_ERROR", message, 400);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function formatApiError(error: unknown) {
  if (isApiError(error)) {
    return {
      statusCode: error.statusCode,
      body: {
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      }
    };
  }

  return {
    statusCode: 500,
    body: {
      success: false,
      error: {
        code: "INTERNAL_ERROR" as const,
        message: "Internal server error."
      }
    }
  };
}
