import type { AgentResponse, ExecutiveExplanation } from "@/types";
import { loadBusinessData, type BusinessDataSnapshot } from "@/lib/business-data";
import { logEvent } from "@/lib/server/logger";
import { PublicApiError } from "@/lib/server/errors";
import {
  buildClarificationResponse,
  composeAnalyticsResponse,
  sourceMetadata,
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
import {
  BUSINESS_STARTER_FOLLOW_UPS,
  routeConversation,
  type CopilotFollowUp,
} from "./conversation-routing";
import {
  noMatchAnswer,
  noMatchFollowUps,
  resolveExplicitEntity,
} from "./entity-resolution";
import { createGeminiAnalyticalPlanningProvider } from "./planning-provider";
import {
  type AnalyticalPlanningProvider,
  planWithGuardrails,
} from "./planner";
import {
  executeRegisteredTool,
  legacyPlanForTool,
  snapshotIdFor,
  type RegisteredToolExecution,
} from "./tool-registry";

export type CopilotResponseState =
  | "SUCCESS"
  | "GREETING"
  | "NEEDS_CLARIFICATION"
  | "NO_MATCH"
  | "OUT_OF_SCOPE"
  | "PARTIAL_DATA"
  | "ERROR";

export type V2AgentResponse<T = unknown> = AgentResponse<T> & {
  responseState: CopilotResponseState;
  followUps: CopilotFollowUp[];
  analysis: AnalysisTrustTrace;
};

function emptyContext(context?: ConversationContext): ConversationContext {
  return context ?? { version: 1, filters: [] };
}

function emptyAnalysis(
  context?: ConversationContext,
  caveats: string[] = [],
): AnalysisTrustTrace {
  return {
    planner: "deterministic_fallback",
    toolsUsed: [],
    semanticMetricIds: [],
    filters: context?.filters ?? [],
    sourceSnapshot: null,
    evidence: {
      dealItemIds: [],
      workOrderItemIds: [],
      dealCount: 0,
      workOrderCount: 0,
    },
    context: emptyContext(context),
    caveats,
  };
}

function sourceForSnapshot(snapshot: BusinessDataSnapshot): AgentResponse["source"] {
  return {
    provider: "monday.com",
    boardIds: [snapshot.source.dealsBoardId, snapshot.source.workOrdersBoardId],
    fetchedAt: snapshot.source.fetchedAt,
  };
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
  if (base.tool === "getPipelineBySector" && base.args.sector) {
    return { type: "sector", id: base.args.sector, label: base.args.sector };
  }
  if (base.tool === "getPipelineByStage" && base.args.stage) {
    return { type: "stage", id: base.args.stage, label: base.args.stage };
  }
  if (base.tool === "getCustomer360") {
    return { type: "client", id: base.args.customerKey, label: base.args.customerKey };
  }
  if (base.tool === "getReceivables" && base.args.customerKey) {
    return { type: "client", id: base.args.customerKey, label: base.args.customerKey };
  }
  if (base.tool === "getWorkOrderHealth" && base.args.customerKey) {
    return { type: "client", id: base.args.customerKey, label: base.args.customerKey };
  }
  if (base.tool === "getPeriodComparison" && base.args.dimension && base.args.entity) {
    return { type: base.args.dimension, id: base.args.entity, label: base.args.entity };
  }
  return undefined;
}

function periodFor(call: ToolCall): ConversationContext["period"] {
  const base = call.tool === "runScenario" ? call.args.analysis : call;
  if (
    base.tool === "getPipelineSummary" ||
    base.tool === "getPipelineBySector" ||
    base.tool === "getPipelineByStage"
  ) {
    return base.args.period;
  }
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

function routedResponse(
  state: "GREETING" | "OUT_OF_SCOPE",
  answer: string,
  context?: ConversationContext,
): V2AgentResponse<never> {
  return {
    ok: true,
    responseState: state,
    answer,
    caveats: [],
    followUps: BUSINESS_STARTER_FOLLOW_UPS,
    source: sourceMetadata(),
    analysis: emptyAnalysis(context),
  };
}

function clarificationWithTrace(
  proposal: Extract<PlannerProposal, { kind: "clarification" | "unsupported" }>,
  planner: AnalysisTrustTrace["planner"],
  context?: ConversationContext,
  plannerCaveats: string[] = [],
): V2AgentResponse<never> {
  if (proposal.kind === "unsupported") {
    return {
      ...routedResponse(
        "OUT_OF_SCOPE",
        "I'm focused on Skylark's approved business intelligence rather than that request. I can help with pipeline, customers, Work Orders, billing, collections, receivables, and operating performance.",
        context,
      ),
      analysis: {
        ...emptyAnalysis(context, plannerCaveats),
        planner,
      },
    };
  }

  const clarification = {
    required: true as const,
    question: proposal.question,
    reason: proposal.reason,
    options: proposal.options,
  };
  const response = buildClarificationResponse(clarification);
  return {
    ...response,
    responseState: "NEEDS_CLARIFICATION",
    followUps: [],
    analysis: {
      ...emptyAnalysis(context, plannerCaveats),
      planner,
    },
  };
}

function routeBeforeAnalytics(
  message: string,
  context?: ConversationContext,
): V2AgentResponse<never> | null {
  const route = routeConversation(message);
  if (route.state === "SUPPORTED_ANALYTICS") return null;

  if (route.state === "GREETING" || route.state === "OUT_OF_SCOPE") {
    return routedResponse(
      route.state,
      route.answer ?? "I can help with Skylark business intelligence.",
      context,
    );
  }

  const clarification = route.clarification ?? {
    question: "Which area would you like to examine?",
    reason: "The business request is too broad to map safely to one approved analytical view.",
    options: BUSINESS_STARTER_FOLLOW_UPS.map((item) => item.query),
  };
  const response = buildClarificationResponse({
    required: true,
    ...clarification,
  });
  return {
    ...response,
    responseState: "NEEDS_CLARIFICATION",
    followUps: [],
    analysis: emptyAnalysis(context),
  };
}

function noMatchWithTrace(
  message: string,
  snapshot: BusinessDataSnapshot,
  context?: ConversationContext,
): V2AgentResponse<never> | null {
  const resolution = resolveExplicitEntity(message, snapshot);
  if (!resolution || resolution.source !== "no_match") return null;

  return {
    ok: true,
    responseState: "NO_MATCH",
    answer: noMatchAnswer(resolution),
    caveats: [],
    followUps: noMatchFollowUps(resolution),
    source: sourceForSnapshot(snapshot),
    analysis: {
      ...emptyAnalysis(context),
      sourceSnapshot: {
        id: snapshotIdFor(snapshot),
        provider: "monday.com",
        boardIds: [snapshot.source.dealsBoardId, snapshot.source.workOrdersBoardId],
        fetchedAt: snapshot.source.fetchedAt,
      },
      caveats: [
        `Entity resolution stopped before analytics because "${resolution.requested}" did not exactly match a canonical ${resolution.kind}.`,
      ],
    },
  };
}

function baseCallFor(call: ToolCall) {
  return call.tool === "runScenario" ? call.args.analysis : call;
}

function followUpsFor(
  call: ToolCall,
  context: ConversationContext,
): CopilotFollowUp[] {
  const base = baseCallFor(call);

  switch (base.tool) {
    case "getPipelineSummary":
      return [
        { label: "Break down by sector", query: "Break the open pipeline down by sector." },
        { label: "Show stage distribution", query: "Show pipeline by stage." },
        { label: "Compare with last quarter", query: "Compare this with last quarter." },
        { label: "Review receivables", query: "What are our receivables?" },
      ];

    case "getPipelineBySector":
      return base.args.sector
        ? [
            { label: "Compare with last quarter", query: "Compare this sector with last quarter." },
            { label: "Show stage distribution", query: "Show pipeline by stage." },
            { label: "Review receivables", query: "What are our receivables?" },
          ]
        : [
            { label: "Show stage distribution", query: "Show pipeline by stage." },
            { label: "Compare with last quarter", query: "Compare open pipeline with last quarter." },
            { label: "Review receivables", query: "What are our receivables?" },
          ];

    case "getPipelineByStage":
      return [
        { label: "Break down by sector", query: "Break the open pipeline down by sector." },
        { label: "Compare with last quarter", query: "Compare this with last quarter." },
        { label: "Review receivables", query: "What are our receivables?" },
      ];

    case "getCustomer360":
      return [
        { label: "Show receivables", query: "Show this customer's receivables." },
        { label: "Show active Work Orders", query: "Show this customer's Work Order health." },
        { label: "Review overall pipeline", query: "How is our pipeline looking?" },
      ];

    case "getReceivables":
      return [
        ...(base.args.customerKey || context.entity?.type === "client"
          ? [{ label: "Show Work Orders", query: "Show this customer's Work Order health." }]
          : [{ label: "Show Work Order health", query: "Show Work Order health." }]),
        { label: "Review pipeline", query: "How is our pipeline looking?" },
        { label: "Break pipeline by sector", query: "Break the open pipeline down by sector." },
      ];

    case "getWorkOrderHealth":
      return [
        ...(base.args.customerKey || context.entity?.type === "client"
          ? [{ label: "Show receivables", query: "Show this customer's receivables." }]
          : [{ label: "Review receivables", query: "What are our receivables?" }]),
        { label: "Review pipeline", query: "How is our pipeline looking?" },
      ];

    case "getPeriodComparison":
      return [
        { label: "Show current pipeline", query: "How is our pipeline looking?" },
        { label: "Break down by sector", query: "Break the open pipeline down by sector." },
      ];
    default:
      return BUSINESS_STARTER_FOLLOW_UPS;
  }
}

function resultHasNoMatch(call: ToolCall, execution: RegisteredToolExecution): boolean {
  const base = baseCallFor(call);

  if (base.tool === "getCustomer360") return execution.result.data === null;

  if (
    (base.tool === "getPipelineBySector" && base.args.sector) ||
    (base.tool === "getPipelineByStage" && base.args.stage)
  ) {
    return Array.isArray(execution.result.data) && execution.result.data.length === 0;
  }

  if (
    (base.tool === "getReceivables" || base.tool === "getWorkOrderHealth") &&
    base.args.customerKey
  ) {
    return execution.evidence.workOrderCount === 0;
  }

  return false;
}

function noMatchAfterExecution(
  call: ToolCall,
  execution: RegisteredToolExecution,
  context: ConversationContext | undefined,
  planner: AnalysisTrustTrace["planner"],
  plannerCaveats: string[],
): V2AgentResponse<unknown> | null {
  if (!resultHasNoMatch(call, execution)) return null;

  const base = baseCallFor(call);
  const entity =
    base.tool === "getCustomer360" ||
    base.tool === "getReceivables" ||
    base.tool === "getWorkOrderHealth"
      ? base.args.customerKey
      : base.tool === "getPipelineBySector"
        ? base.args.sector
        : base.tool === "getPipelineByStage"
          ? base.args.stage
          : undefined;

  return {
    ok: true,
    responseState: "NO_MATCH",
    answer: entity
      ? `No source records matched "${entity}" for this analytical view.`
      : "No source records matched this analytical view.",
    data: execution.result.data,
    caveats: execution.result.caveats,
    followUps: BUSINESS_STARTER_FOLLOW_UPS.slice(0, 3),
    source: execution.source,
    analysis: {
      planner,
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
      context: emptyContext(context),
      caveats: plannerCaveats,
    },
  };
}

function isMaterialPartialCaveat(caveat: string): boolean {
  return /\b(?:unknown|missing|unmapped|excluded|partial|coverage|no usable|not available)\b/i.test(caveat);
}

function responseStateFor(execution: RegisteredToolExecution): CopilotResponseState {
  return execution.semanticTrust.evidenceQuality.status === "Limited" ||
    execution.result.caveats.some(isMaterialPartialCaveat)
    ? "PARTIAL_DATA"
    : "SUCCESS";
}

export async function orchestrateFounderQuestionV2(
  message: string,
  context?: ConversationContext,
  planningProvider: AnalyticalPlanningProvider | null = createGeminiAnalyticalPlanningProvider(),
  explanationProvider: ExecutiveExplanationProvider | null = createGeminiExplanationProvider(),
  requestId?: string,
): Promise<V2AgentResponse<unknown>> {
  const routed = routeBeforeAnalytics(message, context);
  if (routed) return routed;

  const snapshot = await loadBusinessData();

  const entityNoMatch = noMatchWithTrace(message, snapshot, context);
  if (entityNoMatch) return entityNoMatch;

  const planned = await planWithGuardrails(message, snapshot, context, planningProvider);

  if (planned.proposal.kind !== "tool_call") {
    return clarificationWithTrace(
      planned.proposal,
      planned.planner,
      context,
      planned.caveats,
    );
  }

  const call = planned.proposal.call;
  let execution: RegisteredToolExecution;
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

  const executedNoMatch = noMatchAfterExecution(
    call,
    execution,
    context,
    planned.planner,
    planned.caveats,
  );
  if (executedNoMatch) return executedNoMatch;

  const legacyPlan = legacyPlanForTool(call);
  let explanation: ExecutiveExplanation = buildDeterministicFallbackExplanation(
    legacyPlan,
    execution.result,
  );
  const explanationCaveats: string[] = [];

  if (explanationProvider) {
    try {
      explanation = await explanationProvider.explain({
        founderQuestion: message,
        plan: legacyPlan,
        result: execution.result,
        source: execution.source,
      });
    } catch (error) {
      const errorCode = providerErrorCode(error);
      explanationCaveats.push(
        `The optional AI explanation layer was unavailable (${errorCode}); deterministic business truth remains available.`,
      );
      logEvent("warn", "copilot_v2.explanation_fallback", {
        requestId,
        provider: explanationProvider.name,
        model: explanationProvider.model,
        errorCode,
      });
    }
  } else {
    explanationCaveats.push(
      "No optional AI explanation provider was configured; deterministic business truth remains available.",
    );
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
    responseState: responseStateFor(execution),
    followUps: followUpsFor(call, nextContext).slice(0, 4),
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
      ...(execution.scenarioSemanticTrust
        ? {
            scenarioTrust: {
              baseline: execution.semanticTrust,
              scenario: execution.scenarioSemanticTrust,
            },
          }
        : {}),
      context: nextContext,
      caveats: [...planned.caveats, ...explanationCaveats],
    },
  };
}
