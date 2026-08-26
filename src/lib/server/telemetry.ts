import { classifyError, type ErrorCategory } from "./error-taxonomy";
import { logEvent } from "./logger";

export type TelemetryResultStatus =
  | "success"
  | "clarification"
  | "no_match"
  | "out_of_scope"
  | "provider_fallback"
  | "rejected"
  | "error";

export interface OperationTelemetry {
  operation: string;
  toolName?: string;
  provider?: string;
  workspaceKey?: string;
  syncId?: string;
  resultStatus?: TelemetryResultStatus;
  errorCategory?: ErrorCategory;
  recordsFetched?: number;
  recordsNormalized?: number;
  recordsPersisted?: number;
  freshnessState?: string;
}

function durationMs(start: number): number {
  return Math.max(0, Math.round((performance.now() - start) * 100) / 100);
}

export async function observeOperation<T>(
  event: string,
  telemetry: OperationTelemetry,
  operation: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    const result = await operation();
    logEvent("info", event, {
      ...telemetry,
      durationMs: durationMs(started),
      resultStatus: telemetry.resultStatus ?? "success",
    });
    return result;
  } catch (error) {
    logEvent("error", event, {
      ...telemetry,
      durationMs: durationMs(started),
      resultStatus: "error",
      errorCategory: telemetry.errorCategory ?? classifyError(error),
    });
    throw error;
  }
}

export function observeSyncOperation<T>(
  event: string,
  telemetry: OperationTelemetry,
  operation: () => T,
): T {
  const started = performance.now();
  try {
    const result = operation();
    logEvent("info", event, {
      ...telemetry,
      durationMs: durationMs(started),
      resultStatus: telemetry.resultStatus ?? "success",
    });
    return result;
  } catch (error) {
    logEvent("error", event, {
      ...telemetry,
      durationMs: durationMs(started),
      resultStatus: "error",
      errorCategory: telemetry.errorCategory ?? classifyError(error),
    });
    throw error;
  }
}
