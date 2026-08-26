export type AlertCode =
  | "REPEATED_SYNC_FAILURE"
  | "STALE_DATA"
  | "DATABASE_FAILURES"
  | "HIGH_PROVIDER_FAILURE_RATE"
  | "UNEXPECTED_API_5XX";

export interface ReliabilityWindow {
  consecutiveSyncFailures: number;
  freshnessAgeMs: number | null;
  staleAfterMs: number;
  databaseFailures: number;
  providerCalls: number;
  providerFailures: number;
  apiRequests: number;
  api5xx: number;
}

export interface AlertCondition {
  code: AlertCode;
  active: boolean;
  reason: string;
}

export function evaluateAlertConditions(window: ReliabilityWindow): AlertCondition[] {
  const providerFailureRate = window.providerCalls > 0 ? window.providerFailures / window.providerCalls : 0;
  const api5xxRate = window.apiRequests > 0 ? window.api5xx / window.apiRequests : 0;
  return [
    {
      code: "REPEATED_SYNC_FAILURE",
      active: window.consecutiveSyncFailures >= 3,
      reason: "Three or more consecutive temporal sync attempts failed.",
    },
    {
      code: "STALE_DATA",
      active: window.freshnessAgeMs !== null && window.freshnessAgeMs > window.staleAfterMs,
      reason: "The latest successful snapshot is older than the configured freshness threshold.",
    },
    {
      code: "DATABASE_FAILURES",
      active: window.databaseFailures >= 3,
      reason: "Three or more database operation failures occurred in the observation window.",
    },
    {
      code: "HIGH_PROVIDER_FAILURE_RATE",
      active: window.providerCalls >= 10 && providerFailureRate >= 0.2,
      reason: "At least twenty percent of AI provider calls failed across ten or more calls.",
    },
    {
      code: "UNEXPECTED_API_5XX",
      active: window.apiRequests >= 20 && api5xxRate >= 0.05,
      reason: "At least five percent of API requests returned server errors across twenty or more requests.",
    },
  ];
}
