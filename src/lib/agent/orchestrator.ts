import type { AgentResponse } from "@/types";
import {
  dispatchDeterministicAnalytics,
  type AnalyticsDispatcher,
} from "./analytics-adapter";
import { planFounderQuestion } from "./planner";
import {
  buildClarificationResponse,
  composeAnalyticsResponse,
} from "./response";

export async function orchestrateFounderQuestion(
  message: string,
  dispatcher: AnalyticsDispatcher = dispatchDeterministicAnalytics,
): Promise<AgentResponse<unknown>> {
  const decision = planFounderQuestion(message);

  if (decision.clarification) {
    return buildClarificationResponse(decision.clarification);
  }

  if (!decision.plan) {
    throw new Error("Planner returned neither a plan nor a clarification");
  }

  const execution = await dispatcher(decision.plan);
  return composeAnalyticsResponse(
    decision.plan,
    execution.result,
    execution.source,
  );
}
