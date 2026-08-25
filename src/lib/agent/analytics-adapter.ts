import type { AnalyticsResult } from "@/types";
import { PublicApiError } from "@/lib/server/errors";
import type { QueryPlan } from "./schemas";

export type AnalyticsDispatcher = (
  plan: QueryPlan,
) => Promise<AnalyticsResult<unknown>>;

/**
 * Intentional integration seam. Agent 1 owns deterministic analytics exports.
 * This function must stay free of business arithmetic and should only map a
 * validated QueryPlan to Agent 1's canonical analytics functions once exported.
 */
export const dispatchDeterministicAnalytics: AnalyticsDispatcher = async (
  _plan,
) => {
  throw new PublicApiError(
    503,
    "ANALYTICS_NOT_WIRED",
    "Deterministic analytics are not wired into the chat API yet.",
  );
};
