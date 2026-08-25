import { MondayApiError } from "@/lib/monday/errors";

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

function safeMondayError(error: MondayApiError): SafePublicError {
  switch (error.code) {
    case "CONFIGURATION_ERROR":
      return {
        status: 503,
        code: "SOURCE_CONFIGURATION_ERROR",
        message: "Business data source configuration is incomplete.",
      };
    case "TIMEOUT":
      return {
        status: 504,
        code: "MONDAY_TIMEOUT",
        message: "The business data source timed out.",
      };
    case "RATE_LIMITED":
      return {
        status: 503,
        code: "MONDAY_RATE_LIMITED",
        message: "The business data source is temporarily rate limited.",
      };
    case "UPSTREAM_ERROR":
      return {
        status: 502,
        code: "MONDAY_UNAVAILABLE",
        message: "The business data source is temporarily unavailable.",
      };
    case "INVALID_RESPONSE":
      return {
        status: 502,
        code: "MONDAY_INVALID_RESPONSE",
        message: "The business data source returned an invalid response.",
      };
    case "READ_ONLY_VIOLATION":
      return {
        status: 500,
        code: "READ_ONLY_GUARD_TRIGGERED",
        message: "A read-only safety guard prevented the request.",
      };
  }
}

export function toSafePublicError(error: unknown): SafePublicError {
  if (error instanceof PublicApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof MondayApiError) {
    return safeMondayError(error);
  }

  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "The request could not be completed safely.",
  };
}
