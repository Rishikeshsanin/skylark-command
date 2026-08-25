import type { AgentResponse, ExecutiveExplanation } from "@/types";
import { loadBusinessData } from "@/lib/business-data";
import { logEvent } from "@/lib/server/logger";
import { PublicApiError } from "@/lib/server/errors";
import {
  buildClarificationResponse,
  composeAnalyticsResponse,
} from "@/lib/agent/response";
import {
  buildDeterministicFallbackExplanation,
  type ExecutiveExplanationProvider,
} from "@/lib/agent/explanation";
import {
  createGeminiExplanationProvider,
  providerErrorCode,
} from "@/lib/agent/gemini-provider";
import {
  type AnalysisTrustTrace,
  type ConversationContext,
  type PlannerProposal,
  type MetricId,
  type ToolCall,
} from "./contracts";
import { createGeminiAnalyticalPlanningProvider } from "./planning-provider";
import {
  type AnalyticalPlanningProvider,
  planWithGuardrails,
} from "./planner";
import {
  executeRegisteredTool,
  legacyPlanForTool,
} from "./tool-registry";

export type V2AgentResponse<T = unknown> = AgentResponse<T> & {
  analysis: AnalysisTrustTrace;
};

function emptyContext(context?: ConversationContext): ConversationContext {
  return context ?? { version: 1, filters: [] };
}

function dimensionFor(call: ToolCall): ConversationContext["dimension"] {
  const base = call.tool === "runScenario" ? call.args.analysis : call;
  if (base.tool === "getPipelineBySector") return "sector";
  if (base.tool === "getPipelineByStage") return "stage";
  if (base.tool === "getCustomer360") return "client";
  if (base.tool === "getPeriodComparison") return base.args.dimension;
  return undefined;
}

function entityFor(call: ToolCall): ConversationContext["entity"] {
  const base = call.tool === "runScenario" ? call.args.analysis : call;
  if (base.tool === "getPipelineBySector" && base.args.sector) return { type: "sector", id: base.args.sector, label: base.args.sector };
  if (base.tool === "getPipelineByStage" && base.args.stage) return { type: "stage", id: base.args.stage, label: base.args.stage };
  if (base.tool === "getCustomer360") return { type: "client", id: base.args.customerKey, label: base.args.customerKey };
  if (base.tool === "getReceivables" && base.args.customerKey) return { type: "client", id: base.args.customerKey, label: base.args.customerKey };
  if (base.tool === "getWorkOrderHealth" && base.args.customerKey) return { type: "client", id: base.args.customerKey, label: base.args.customerKey };
  if (base.tool === "getPeriodComparison" && base.args.dimension && base.args.entity) return { type: base.args.dimension, id: base.args.entity, label: base.args.entity };
  return undefined;
}

function periodFor(call: ToolCall): ConversationContext["period"] {
  const base = call.tool === "runScenario" ? call.args.analysis : call;
  if (base.tool === "getPipelineSummary" || base.tool === "getPipelineBySector" || base.tool === "getPipelineByStage") return base.args.period;
  if (base.tool === "getPeriodComparison") return base.args.to;
  return undefined;
}

function buildContext(
  previous: ConversationContext | undefined,
  call: ToolCall,
  snapshotId: string,
  metricIds: MetricId[],
  filters: AnalysisTrustTrace["filters"],
): ConversationContext {
  const metricId = metricIds[0] ?? previous?.metricId;
  return {
    version: 1,
    metricId,
    dimension: dimensionFor(call) ?? previous?.dimension,
    entity: entityFor(call) ?? previous?.entity,
    period: periodFor(call) ?? previous?.period,
    filters,
    previousResult: {
      toolCall: call,
      snapshotId,
      semanticMetricIds: metricIds,
      resultRef: `${snapshotId}:${call.tool}`.slice(0, 240),
    },
  };
}

function clarificationWithTrace(
  proposal: Extract<PlannerProposal, { kind: "clarification" | "unsupported" }>,
  planner: AnalysisTrustTrace["planner"],
  context?: ConversationContext,
  plannerCaveats: string[] = [],
): V2AgentResponse<never> {
  const clarification = proposal.kind === "clarification"
    ? { required: true as const, question: proposal.question, reason: proposal.reason, options: proposal.options }
    : { required: true as const, question: "Could you restate that as a supported business analysis?", reason: proposal.reason };
  const response = buildClarificationResponse(clarification);
  return {
    ...response,
    analysis: {
      planner,
      toolsUsed: [],
      semanticMetricIds: [],
      filters: context?.filters ?? [],
      sourceSnapshot: null,
      evidence: { dealItemIds: [], workOrderItemIds: [], dealCount: 0, workOrderCount: 0 },
      context: emptyContext(context),
      caveats: plannerCaveats,
    },
  };
}

export async function orchestrateFounderQuestionV2(
  message: string,
  context?: ConversationContext,
  planningProvider: AnalyticalPlanningProvider | null = createGeminiAnalyticalPlanningProvider(),
  explanationProvider: ExecutiveExplanationProvider | null = createGeminiExplanationProvider(),
  requestId?: string,
): Promise<V2AgentResponse<unknown>> {
  const snapshot = await loadBusinessData();
  const planned = await planWithGuardrails(message, snapshot, context, planningProvider);

  if (planned.proposal.kind !== "tool_call") {
    return clarificationWithTrace(planned.proposal, planned.planner, context, planned.caveats);
  }

  const call = planned.proposal.call;
  let execution;
  try {
    execution = await executeRegisteredTool(call, snapshot);
  } catch (error) {
    logEvent("warn", "copilot_v2.tool_rejected", {
      requestId,
      tool: call.tool,
      reason: error instanceof Error ? error.message : "unknown",
    });
    throw new PublicApiError(
      422,
      "INVALID_ANALYTICAL_TOOL_INPUT",
      "The proposed analysis or scenario could not be executed with the grounded source data.",
    );
  }

  const legacyPlan = legacyPlanForTool(call);
  let explanation: ExecutiveExplanation = buildDeterministicFallbackExplanation(
    legacyPlan,
    execution.result,
  );

  if (explanationProvider) {
    try {
      explanation = await explanationProvider.explain({
        founderQuestion: message,
        plan: legacyPlan,
        result: execution.result,
        source: execution.source,
      });
    } catch (error) {
      logEvent("warn", "copilot_v2.explanation_fallback", {
        requestId,
        provider: explanationProvider.name,
        model: explanationProvider.model,
        errorCode: providerErrorCode(error),
      });
    }
  }

  const nextContext = buildContext(
    context,
    call,
    execution.snapshotId,
    execution.semanticMetricIds,
    execution.filters,
  );
  const response = composeAnalyticsResponse(
    legacyPlan,
    execution.result,
    execution.source,
    explanation,
  );

  return {
    ...response,
    analysis: {
      planner: planned.planner,
      toolsUsed: execution.toolsUsed,
      semanticMetricIds: execution.semanticMetricIds,
      filters: execution.filters,
      sourceSnapshot: {
        id: execution.snapshotId,
        provider: "monday.com",
        boardIds: execution.source.boardIds,
        fetchedAt: execution.source.fetchedAt,
      },
      evidence: execution.evidence,
      semanticTrust: execution.semanticTrust,
      ...(execution.scenarioSemanticTrust ? { scenarioTrust: { baseline: execution.semanticTrust, scenario: execution.scenarioSemanticTrust } } : {}),
      context: nextContext,
      caveats: planned.caveats,
    },
  };
}
