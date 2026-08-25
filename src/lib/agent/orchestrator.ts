import type { AgentResponse, ExecutiveExplanation } from "@/types";
import { logEvent } from "@/lib/server/logger";
import {
  dispatchDeterministicAnalytics,
  type AnalyticsDispatcher,
} from "./analytics-adapter";
import {
  buildDeterministicFallbackExplanation,
  type ExecutiveExplanationProvider,
} from "./explanation";
import {
  createGeminiExplanationProvider,
  providerErrorCode,
} from "./gemini-provider";
import { planFounderQuestion } from "./planner";
import {
  buildClarificationResponse,
  composeAnalyticsResponse,
} from "./response";

export async function orchestrateFounderQuestion(
  message: string,
  dispatcher: AnalyticsDispatcher = dispatchDeterministicAnalytics,
  explanationProvider: ExecutiveExplanationProvider | null = createGeminiExplanationProvider(),
  requestId?: string,
): Promise<AgentResponse<unknown>> {
  const decision = planFounderQuestion(message);

  if (decision.clarification) {
    return buildClarificationResponse(decision.clarification);
  }

  if (!decision.plan) {
    throw new Error("Planner returned neither a plan nor a clarification");
  }

  const execution = await dispatcher(decision.plan);
  let explanation: ExecutiveExplanation = buildDeterministicFallbackExplanation(
    decision.plan,
    execution.result,
  );

  if (explanationProvider) {
    try {
      explanation = await explanationProvider.explain({
        founderQuestion: message,
        plan: decision.plan,
        result: execution.result,
        source: execution.source,
      });
    } catch (error) {
      logEvent("warn", "ai.explanation_fallback", {
        requestId,
        provider: explanationProvider.name,
        model: explanationProvider.model,
        errorCode: providerErrorCode(error),
      });
    }
  }

  return composeAnalyticsResponse(
    decision.plan,
    execution.result,
    execution.source,
    explanation,
  );
}
