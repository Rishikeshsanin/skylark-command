import { MondayApiError } from "@/lib/monday/errors";
import { PublicApiError } from "./errors";

export type ErrorCategory =
  | "VALIDATION"
  | "AUTHORIZATION"
  | "UPSTREAM_MONDAY"
  | "DATABASE"
  | "AI_PROVIDER"
  | "TIMEOUT"
  | "ANALYTICS"
  | "SYNC"
  | "INTERNAL";

export function classifyError(error: unknown): ErrorCategory {
  if (error instanceof MondayApiError) {
    return error.code === "TIMEOUT" ? "TIMEOUT" : "UPSTREAM_MONDAY";
  }
  if (error instanceof PublicApiError) {
    if (error.status === 401 || error.status === 403) return "AUTHORIZATION";
    if (error.status === 408 || error.status === 504 || /TIMEOUT/i.test(error.code)) return "TIMEOUT";
    if (error.status >= 400 && error.status < 500) return "VALIDATION";
  }
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  if (/database|postgres|sql|connection refused|DATABASE_URL/i.test(message)) return "DATABASE";
  if (/gemini|provider|model|AI_PROVIDER/i.test(message)) return "AI_PROVIDER";
  if (/timeout|timed out|abort/i.test(message)) return "TIMEOUT";
  if (/sync|snapshot|watermark/i.test(message)) return "SYNC";
  if (/analytic|tool|metric|scenario/i.test(message)) return "ANALYTICS";
  return "INTERNAL";
}
