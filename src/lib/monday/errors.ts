export type MondayErrorCode =
  | "CONFIGURATION_ERROR"
  | "READ_ONLY_VIOLATION"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "INVALID_RESPONSE";

export class MondayApiError extends Error {
  readonly code: MondayErrorCode;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    code: MondayErrorCode,
    message: string,
    options: { status?: number | null; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "MondayApiError";
    this.code = code;
    this.status = options.status ?? null;
    this.retryable = options.retryable ?? false;
  }
}
