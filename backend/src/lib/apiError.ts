import { ERROR_MESSAGES, ERROR_STATUS, type ErrorCode } from "@task-mini/shared";

/**
 * Error carrying a machine-readable code. Thrown anywhere in a handler and
 * rendered into the shared `{ error: { code, message, details, requestId } }`
 * envelope by the central error middleware.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, options: { message?: string; details?: Record<string, unknown> } = {}) {
    super(options.message ?? ERROR_MESSAGES[code]);
    this.name = "ApiError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = options.details;
  }
}
