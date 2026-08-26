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
  type BaseToolCall,
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
  parseMoneyMention,
  type AnalyticalPlanningProvider,
  planWithGuardrails,
} from "./planner";
import {
  customerContributionScopeFromContext,
  validateCustomerContributionProposalGrounding,
} from "./customer-contribution-tool";
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

type PipelineScopeCall = Extract<
  BaseToolCall,
  { tool: "getPipelineSummary" | "getPipelineBySector" | "getPipelineByStage" }
>;

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

function baseCallFromContext(context?: ConversationContext): BaseToolCall | null {
  const call = context?.previousResult?.toolCall;
  if (!call) return null;
  return call.tool === "runScenario" ? call.args.analysis : call;
}

function isPipelineScopeCall(call: BaseToolCall): call is PipelineScopeCall {
  return call.tool === "getPipelineSummary" ||
    call.tool === "getPipelineBySector" ||
    call.tool === "getPipelineByStage";
}

function isCustomerContributionFollowUp(message: string): boolean {
  return /\b(customers?|clients?)\b/i.test(message) &&
    /\b(behind|contribut(?:e|es|ion|ions)|driv(?:e|es|ing)|make up|account for)\b/i.test(message);
}

function thresholdContinuation(message: string, context?: ConversationContext): ToolCall | null {
  const previous = baseCallFromContext(context);
  if (!previous || !isPipelineScopeCall(previous)) return null;
  const amount = parseMoneyMention(message);
  if (amount === null || !/\b(above|over|greater than|at least|>=)\b/i.test(message)) return null;

  if (previous.tool === "getPipelineSummary") {
    return {
      tool: "getPipelineSummary",
      args: {
        ...previous.args,
        ...(context?.entity?.type === "sector" && !previous.args.sector ? { sector: context.entity.id } : {}),
        ...(context?.entity?.type === "stage" && !previous.args.stage ? { stage: context.entity.id } : {}),
        minDealValue: amount,
      },
    };
  }
  if (previous.tool === "getPipelineBySector") {
    return {
      tool: "getPipelineBySector",
      args: {
        ...previous.args,
        ...(context?.entity?.type === "sector" && !previous.args.sector ? { sector: context.entity.id } : {}),
        minDealValue: amount,
      },
    };
  }
  return {
    tool: "getPipelineByStage",
    args: {
      ...previous.args,
      ...(context?.entity?.type === "stage" && !previous.args.stage ? { stage: context.entity.id } : {}),
      minDealValue: amount,
    },
  };
}

function deterministicContinuation(message: string, context?: ConversationContext): ToolCall | null {
  const previous = baseCallFromContext(context);
  if (isCustomerContributionFollowUp(message) && context) {
    return customerContributionScopeFromContext(previous, context);
  }
  return thresholdContinuation(message, context);
}

function dimensionFor(call: ToolCall): ConversationContext["dimension"] {
  const base = call.tool === "runScenario" ? call.args.analysis : call;
  if (base.tool === "getPipelineBySector") return "sector";
  if (base.tool === "getPipelineByStage") return "stage";
  if (base.tool === "getCustomerContribution") return "client";
  if (base.tool === "getCustomer360") return "client";
  if (base.tool === "getPeriodComparison") return base.args.dimension;
  return undefined;
}

function bestSectorFromResult(data: unknown): string | undefined {
  if (!Array.isArray(data)) return undefined;
  const rows = data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  return rows
    .filter((row) => typeof row.sector === "string" && typeof row.openPipelineValue === "number")
    .sort((a, b) =>
      (b.openPipelineValue as number) - (a.openPipelineValue as number) ||
      (typeof b.openDealCount === "number" ? b.openDealCount : 0) - (typeof a.openDealCount === "number" ? a.openDealCount : 0) ||
      (a.sector as string).localeCompare(b.sector as string),
    )[0]?.sector as string | undefined;
}

function bestStageFromResult(data: unknown): string | undefined {
  if (!Array.isArray(data)) return undefined;
  const rows = data.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  return rows
    .filter((row) => typeof row.stage === "string" && typeof row.totalValue === "number")
    .sort((a, b) =>
      (b.totalValue as number) - (a.totalValue as number) ||
      (typeof b.dealCount === "number" ? b.dealCount : 0) - (typeof a.dealCount === "number" ? a.dealCount : 0) ||
      (a.stage as string).localeCompare(b.stage as string),
    )[0]?.stage as string | undefined;
}

function entityFor(call: ToolCall, resultData?: unknown): ConversationContext["entity"] {
  const base = call.tool === "runScenario" ? call.args.analysis : call;
  if (base.tool === "getPipelineBySector") {
    const sector = base.args.sector ?? bestSectorFromResult(resultData);
    if (sector) return { type: "sector", id: sector, label: sector };
  }
  if (base.tool === "getPipelineByStage") {
    const stage = base.args.stage ?? bestStageFromResult(resultData);
    if (stage) return { type: "stage", id: stage, label: stage };
  }
  if (base.tool === "getCustomerContribution" && base.args.customerKey) {
    return { type: "client", id: base.args.customerKey, label: base.args.customerKey };
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
    base.tool === "getPipelineByStage" ||
    base.tool === "getCustomerContribution"
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
  resultData?: unknown,
): ConversationContext {
  const metricId = metricIds[0] ?? previous?.metricId;
  return {
    version: 1,
    metricId,
    dimension: dimensionFor(call) ?? previous?.dimension,
    entity: entityFor(call, resultData) ?? previous?.entity,
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

function baseCallFor(call: ToolCall): BaseToolCall {
  return call.tool === "runScenario" ? call.args.analysis : call;
}

function customerContributionFollowUps(resultData: unknown): CopilotFollowUp[] {
  if (!resultData || typeof resultData !== "object" || Array.isArray(resultData)) return [];
  const result = resultData as Record<string, unknown>;
  if (result.kind !== "customer_contribution" || !Array.isArray(result.customers)) return [];
  const first = result.customers[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return [];
  const row = first as Record<string, unknown>;
  const followUp = row.followUp;
  if (!followUp || typeof followUp !== "object" || Array.isArray(followUp)) return [];
  const metadata = followUp as Record<string, unknown>;
  const customerKey = typeof metadata.customerKey === "string" ? metadata.customerKey : null;
  const actions = Array.isArray(metadata.supportedActions)
    ? metadata.supportedActions.filter((value): value is string => typeof value === "string")
    : [];
  if (!customerKey) return [];

  const output: CopilotFollowUp[] = [];
  for (const action of actions) {
    if (action === "customer_360") {
      output.push({ label: "Open Customer 360", query: `Open Customer 360 for ${customerKey}.` });
    } else if (action === "work_orders") {
      output.push({ label: "Show Work Orders", query: `Show Work Orders for ${customerKey}.` });
    } else if (action === "receivables") {
      output.push({ label: "Show receivables", query: `Show receivables for ${customerKey}.` });
    } else if (action === "compare_customer_contributions") {
      output.push({ label: "Compare contributions", query: "Compare customer contributions in this grounded scope." });
    }
  }
  return output;
}

function followUpsFor(
  call: ToolCall,
  context: ConversationContext,
  resultData?: unknown,
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
            { label: "Show customer contribution", query: "Which customers are behind those?" },
            { label: "Show stage distribution", query: "Show pipeline by stage." },
            { label: "Review receivables", query: "What are our receivables?" },
          ]
        : [
            { label: "Show customer contribution", query: "Which customers are behind the largest sector?" },
            { label: "Show stage distribution", query: "Show pipeline by stage." },
            { label: "Compare with last quarter", query: "Compare open pipeline with last quarter." },
            { label: "Review receivables", query: "What are our receivables?" },
          ];

    case "getPipelineByStage":
      return [
        { label: "Show customer contribution", query: "Which customers are behind those?" },
        { label: "Break down by sector", query: "Break the open pipeline down by sector." },
        { label: "Compare with last quarter", query: "Compare this with last quarter." },
        { label: "Review receivables", query: "What are our receivables?" },
      ];

    case "getCustomerContribution": {
      const structured = customerContributionFollowUps(resultData);
      return structured.length > 0 ? structured : [
        { label: "Review pipeline", query: "How is our pipeline looking?" },
        { label: "Review receivables", query: "What are our receivables?" },
      ];
    }

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

  if (base.tool === "getCustomerContribution") {
    const data = execution.result.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const coverage = (data as Record<string, unknown>).coverage;
      if (coverage && typeof coverage === "object" && !Array.isArray(coverage)) {
        return (coverage as Record<string, unknown>).scopedDealCount === 0;
      }
    }
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
          : base.tool === "getCustomerContribution"
            ? base.args.customerKey ?? base.args.sector ?? base.args.stage
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
  const continuation = deterministicContinuation(message, context);
  if (!continuation) {
    const routed = routeBeforeAnalytics(message, context);
    if (routed) return routed;
  }

  const snapshot = await loadBusinessData();

  if (!continuation) {
    const entityNoMatch = noMatchWithTrace(message, snapshot, context);
    if (entityNoMatch) return entityNoMatch;
  }

  const planned = continuation
    ? {
        proposal: { kind: "tool_call" as const, call: continuation, confidence: 1 },
        planner: "deterministic_fallback" as const,
        caveats: ["Structured prior analytical scope was reused deterministically for this follow-up; no metric was recalculated by the LLM."],
      }
    : await planWithGuardrails(message, snapshot, context, planningProvider);

  if (planned.proposal.kind !== "tool_call") {
    return clarificationWithTrace(
      planned.proposal,
      planned.planner,
      context,
      planned.caveats,
    );
  }

  const call = planned.proposal.call;
  if (call.tool === "getCustomerContribution" && planned.planner === "gemini") {
    const groundingIssue = validateCustomerContributionProposalGrounding(
      call,
      message,
      context,
      snapshot,
      parseMoneyMention(message),
    );
    if (groundingIssue) {
      return clarificationWithTrace(
        {
          kind: "clarification",
          question: "Could you clarify the exact customer-contribution scope?",
          reason: `The proposed customer-contribution analysis failed grounding validation. ${groundingIssue}`,
        },
        planned.planner,
        context,
        planned.caveats,
      );
    }
  }

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
    execution.result.data,
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
    followUps: followUpsFor(call, nextContext, execution.result.data).slice(0, 4),
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
