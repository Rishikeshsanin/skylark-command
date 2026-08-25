export class PublicApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, publicMessage: string) {
    super(publicMessage);
    this.name = "PublicApiError";
    this.status = status;
    this.code = code;
  }
}

export class ExternalTimeoutError extends PublicApiError {
  constructor(label = "External service") {
    super(504, "UPSTREAM_TIMEOUT", `${label} timed out.`);
    this.name = "ExternalTimeoutError";
  }
}

export interface SafePublicError {
  status: number;
  code: string;
  message: string;
}

export function toSafePublicError(error: unknown): SafePublicError {
  if (error instanceof PublicApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "The request could not be completed safely.",
  };
}
