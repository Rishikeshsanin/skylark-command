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
  type BaseToolCall,
  type ConversationContext,
  type PlannerProposal,
  type MetricId,
  type ToolCall,
} from "./contracts";
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
} from "./tool-registry";

export type V2AgentResponse<T = unknown> = AgentResponse<T> & {
  analysis: AnalysisTrustTrace;
};

function emptyContext(context?: ConversationContext): ConversationContext {
  return context ?? { version: 1, filters: [] };
}

function baseCallFromContext(context?: ConversationContext): BaseToolCall | null {
  const call = context?.previousResult?.toolCall;
  if (!call) return null;
  return call.tool === "runScenario" ? call.args.analysis : call;
}

function isCustomerContributionFollowUp(message: string): boolean {
  return /\b(customers?|clients?)\b/i.test(message) &&
    /\b(behind|contribut(?:e|es|ion|ions)|driv(?:e|es|ing)|make up|account for)\b/i.test(message);
}

function thresholdContinuation(message: string, context?: ConversationContext): ToolCall | null {
  const previous = baseCallFromContext(context);
  if (!previous || !["getPipelineSummary", "getPipelineBySector", "getPipelineByStage"].includes(previous.tool)) {
    return null;
  }
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
  if (base.tool === "getCustomerContribution" && base.args.customerKey) return { type: "client", id: base.args.customerKey, label: base.args.customerKey };
  if (base.tool === "getCustomer360") return { type: "client", id: base.args.customerKey, label: base.args.customerKey };
  if (base.tool === "getReceivables" && base.args.customerKey) return { type: "client", id: base.args.customerKey, label: base.args.customerKey };
  if (base.tool === "getWorkOrderHealth" && base.args.customerKey) return { type: "client", id: base.args.customerKey, label: base.args.customerKey };
  if (base.tool === "getPeriodComparison" && base.args.dimension && base.args.entity) return { type: base.args.dimension, id: base.args.entity, label: base.args.entity };
  return undefined;
}

function periodFor(call: ToolCall): ConversationContext["period"] {
  const base = call.tool === "runScenario" ? call.args.analysis : call;
  if (
    base.tool === "getPipelineSummary" ||
    base.tool === "getPipelineBySector" ||
    base.tool === "getPipelineByStage" ||
    base.tool === "getCustomerContribution"
  ) return base.args.period;
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
  const continuation = deterministicContinuation(message, context);
  const planned = continuation
    ? {
        proposal: { kind: "tool_call" as const, call: continuation, confidence: 1 },
        planner: "deterministic_fallback" as const,
        caveats: ["Structured prior analytical scope was reused deterministically for this follow-up; no metric was recalculated by the LLM."],
      }
    : await planWithGuardrails(message, snapshot, context, planningProvider);

  if (planned.proposal.kind !== "tool_call") {
    return clarificationWithTrace(planned.proposal, planned.planner, context, planned.caveats);
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
