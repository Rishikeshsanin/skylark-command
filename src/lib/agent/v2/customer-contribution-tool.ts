import { calculateCustomerContribution } from "@/lib/analytics/customer-contribution";
import type { BusinessDataSnapshot } from "@/lib/business-data";
import { normalizeClientCode } from "@/lib/normalization/client-code";
import { assessEvidenceQuality } from "@/lib/semantic/evidence-quality";
import { buildAnswerLineage } from "@/lib/semantic/lineage";
import { buildTrustResponse } from "@/lib/semantic/trust";
import type { LineageFilter, TrustResponse } from "@/lib/semantic/types";
import type { AnalyticsResult } from "@/types";
import type {
  AnalysisFilter,
  AnalysisPeriod,
  BaseToolCall,
  ConversationContext,
  MetricId,
  ToolEvidence,
} from "./contracts";

export type CustomerContributionCall = Extract<
  BaseToolCall,
  { tool: "getCustomerContribution" }
>;

export interface CustomerContributionToolExecution {
  result: AnalyticsResult<unknown>;
  semanticMetricIds: MetricId[];
  filters: AnalysisFilter[];
  evidence: ToolEvidence;
  semanticTrust: TrustResponse;
}

function lower(value: string): string {
  return value.trim().toLowerCase();
}

function statusForMetric(metricId: "open_pipeline_value" | "known_won_value"): "Open" | "Won" {
  return metricId === "known_won_value" ? "Won" : "Open";
}

function filtersFor(call: CustomerContributionCall, normalizedCustomerKey?: string): AnalysisFilter[] {
  const metricId = call.args.metricId ?? (call.args.status === "Won" ? "known_won_value" : "open_pipeline_value");
  const status = call.args.status ?? statusForMetric(metricId);
  const filters: AnalysisFilter[] = [{ field: "status", operator: "eq", value: status }];
  if (call.args.sector) filters.push({ field: "sector", operator: "eq", value: call.args.sector });
  if (call.args.stage) filters.push({ field: "stage", operator: "eq", value: call.args.stage });
  if (normalizedCustomerKey) filters.push({ field: "client", operator: "eq", value: normalizedCustomerKey });
  if (call.args.minDealValue !== undefined) filters.push({ field: "deal_value", operator: "gte", value: call.args.minDealValue });
  if (call.args.maxDealValue !== undefined) filters.push({ field: "deal_value", operator: "lte", value: call.args.maxDealValue });
  if (call.args.dealIds) filters.push({ field: "deal_ids", operator: "in", value: [...new Set(call.args.dealIds)].sort() });
  return filters;
}

function semanticFilters(filters: AnalysisFilter[], resolvedPeriod: string | null): LineageFilter[] {
  const output: LineageFilter[] = [];
  for (const filter of filters) {
    if (filter.field === "sector" || filter.field === "stage" || filter.field === "client" || filter.field === "status") {
      output.push({ dimension: filter.field, operator: "eq", values: [filter.value] });
    }
    if (filter.field === "deal_value") {
      output.push({ field: "deal_value", operator: filter.operator, value: filter.value });
    }
    if (filter.field === "deal_ids") {
      output.push({ field: "deal_ids", operator: "in", values: filter.value });
    }
  }
  if (resolvedPeriod) {
    output.push({ dimension: "quarter", operator: "eq", values: [resolvedPeriod] });
  }
  return output;
}

function issueCounts(snapshot: BusinessDataSnapshot) {
  return snapshot.normalizationIssues.reduce(
    (counts, issue) => ({ ...counts, [issue.severity]: counts[issue.severity] + 1 }),
    { info: 0, warning: 0, error: 0 },
  );
}

function assertSourceEntities(call: CustomerContributionCall, baseline: BusinessDataSnapshot): void {
  const sectors = new Set(baseline.deals.map((deal) => deal.sector).filter((value): value is string => Boolean(value)).map(lower));
  const stages = new Set(baseline.deals.map((deal) => deal.stage).filter((value): value is string => Boolean(value)).map(lower));
  const customers = new Set(baseline.deals.map((deal) => deal.normalizedClientKey).filter((value): value is string => Boolean(value)));
  const dealIds = new Set(baseline.deals.map((deal) => deal.mondayItemId));

  if (call.args.sector && !sectors.has(lower(call.args.sector))) {
    throw new Error(`Customer contribution sector “${call.args.sector}” does not exist in the source snapshot.`);
  }
  if (call.args.stage && !stages.has(lower(call.args.stage))) {
    throw new Error(`Customer contribution stage “${call.args.stage}” does not exist in the source snapshot.`);
  }
  if (call.args.customerKey) {
    const normalized = normalizeClientCode(call.args.customerKey);
    if (!normalized || !customers.has(normalized)) {
      throw new Error(`Customer contribution customer “${call.args.customerKey}” does not exist as an exact normalized Deal customer.`);
    }
  }
  for (const id of call.args.dealIds ?? []) {
    if (!dealIds.has(id)) throw new Error(`Customer contribution Deal ${id} does not exist in the source snapshot.`);
  }
}

function contextStringGrounded(value: string, field: "sector" | "stage" | "client", context?: ConversationContext): boolean {
  const normalized = lower(value);
  if (context?.entity && (lower(context.entity.id) === normalized || lower(context.entity.label ?? "") === normalized)) return true;
  return context?.filters.some((filter) => filter.field === field && lower(filter.value as string) === normalized) ?? false;
}

function contextNumberGrounded(value: number, operator: "gte" | "lte", context?: ConversationContext): boolean {
  return context?.filters.some(
    (filter) => filter.field === "deal_value" && filter.operator === operator && filter.value === value,
  ) ?? false;
}

export function validateCustomerContributionProposalGrounding(
  call: CustomerContributionCall,
  message: string,
  context: ConversationContext | undefined,
  baseline: BusinessDataSnapshot,
  mentionedMoney: number | null,
): string | null {
  try {
    assertSourceEntities(call, baseline);
  } catch (error) {
    return error instanceof Error ? error.message : "Customer contribution source grounding failed.";
  }

  const messageLower = lower(message);
  const checkString = (value: string | undefined, field: "sector" | "stage" | "client", label: string) => {
    if (!value) return null;
    return messageLower.includes(lower(value)) || contextStringGrounded(value, field, context)
      ? null
      : `${label} “${value}” was not grounded in the user message or structured context.`;
  };

  const sectorIssue = checkString(call.args.sector, "sector", "Sector");
  if (sectorIssue) return sectorIssue;
  const stageIssue = checkString(call.args.stage, "stage", "Stage");
  if (stageIssue) return stageIssue;
  const customerIssue = checkString(call.args.customerKey, "client", "Customer");
  if (customerIssue) return customerIssue;

  if (call.args.minDealValue !== undefined && mentionedMoney !== call.args.minDealValue && !contextNumberGrounded(call.args.minDealValue, "gte", context)) {
    return "Minimum Deal value was not grounded in the user message or structured context.";
  }
  if (call.args.maxDealValue !== undefined && mentionedMoney !== call.args.maxDealValue && !contextNumberGrounded(call.args.maxDealValue, "lte", context)) {
    return "Maximum Deal value was not grounded in the user message or structured context.";
  }

  const metricId = call.args.metricId ?? (call.args.status === "Won" ? "known_won_value" : "open_pipeline_value");
  const status = call.args.status ?? statusForMetric(metricId);
  const statusGrounded = messageLower.includes(lower(status)) ||
    context?.metricId === metricId ||
    context?.filters.some((filter) => filter.field === "status" && filter.value === status);
  if (!statusGrounded && (call.args.metricId !== undefined || call.args.status !== undefined)) {
    return `Deal status ${status} was not grounded in the request or prior semantic metric context.`;
  }

  const contextDealIds = context?.filters.find((filter) => filter.field === "deal_ids");
  for (const id of call.args.dealIds ?? []) {
    const grounded = messageLower.includes(lower(id)) ||
      (contextDealIds?.field === "deal_ids" && contextDealIds.value.includes(id));
    if (!grounded) return `Deal ${id} was not grounded in the user message or structured context.`;
  }
  return null;
}

export function executeCustomerContributionTool(
  call: CustomerContributionCall,
  baseline: BusinessDataSnapshot,
  resolvedPeriod: string | null,
): CustomerContributionToolExecution {
  assertSourceEntities(call, baseline);
  const result = calculateCustomerContribution(baseline.deals, {
    metricId: call.args.metricId,
    status: call.args.status,
    sector: call.args.sector,
    stage: call.args.stage,
    customerKey: call.args.customerKey,
    minDealValue: call.args.minDealValue,
    maxDealValue: call.args.maxDealValue,
    period: resolvedPeriod,
    dealIds: call.args.dealIds,
  });
  const filters = filtersFor(call, result.scope.customerKey);
  const semanticMetricIds: MetricId[] = [result.metricId];
  const lineage = buildAnswerLineage({
    metricIds: semanticMetricIds,
    snapshot: baseline,
    analysisTimestamp: new Date().toISOString(),
    filters: semanticFilters(filters, resolvedPeriod),
    timeRange: resolvedPeriod ? { dimension: "quarter", label: resolvedPeriod } : undefined,
  });
  const quality = assessEvidenceQuality({
    lineage,
    sourceQualityIssues: issueCounts(baseline),
    temporalCoverage: call.args.period && call.args.period.kind !== "all_time"
      ? {
          requested: true,
          covered: result.coverage.scopedDealCount > 0,
          reason: result.coverage.scopedDealCount > 0
            ? `The deterministic customer-contribution scope contains Deal evidence for ${resolvedPeriod ?? "the requested period"}.`
            : `No Deal evidence matched ${resolvedPeriod ?? "the requested period"}.`,
        }
      : { requested: false, covered: true },
  });
  const semanticTrust = buildTrustResponse(lineage, quality);
  const evidence: ToolEvidence = {
    dealItemIds: result.recordsIncluded.slice(0, 50),
    workOrderItemIds: [],
    dealCount: result.coverage.scopedDealCount,
    workOrderCount: 0,
  };

  return {
    result: {
      data: result,
      caveats: result.caveats,
    },
    semanticMetricIds,
    filters,
    evidence,
    semanticTrust,
  };
}

export function customerContributionScopeFromContext(
  previous: BaseToolCall | null,
  context: {
    metricId?: MetricId;
    entity?: { type: string; id: string };
    filters: AnalysisFilter[];
    period?: AnalysisPeriod;
  },
): CustomerContributionCall | null {
  if (!previous) return null;
  if (!["getPipelineSummary", "getPipelineBySector", "getPipelineByStage", "getCustomerContribution"].includes(previous.tool)) {
    return null;
  }

  if (previous.tool === "getCustomerContribution") {
    return { tool: "getCustomerContribution", args: { ...previous.args } };
  }

  const sector = previous.tool === "getPipelineBySector"
    ? previous.args.sector ?? (context.entity?.type === "sector" ? context.entity.id : undefined)
    : previous.tool === "getPipelineSummary"
      ? previous.args.sector
      : undefined;
  const stage = previous.tool === "getPipelineByStage"
    ? previous.args.stage ?? (context.entity?.type === "stage" ? context.entity.id : undefined)
    : previous.tool === "getPipelineSummary"
      ? previous.args.stage
      : undefined;
  const metricId = context.metricId === "known_won_value" ? "known_won_value" : "open_pipeline_value";
  const minContext = context.filters.find((filter) => filter.field === "deal_value" && filter.operator === "gte");
  const maxContext = context.filters.find((filter) => filter.field === "deal_value" && filter.operator === "lte");
  const idsContext = context.filters.find((filter) => filter.field === "deal_ids");

  return {
    tool: "getCustomerContribution",
    args: {
      metricId,
      status: statusForMetric(metricId),
      ...(sector ? { sector } : {}),
      ...(stage ? { stage } : {}),
      ...(previous.args.minDealValue !== undefined
        ? { minDealValue: previous.args.minDealValue }
        : minContext?.field === "deal_value" ? { minDealValue: minContext.value } : {}),
      ...(maxContext?.field === "deal_value" ? { maxDealValue: maxContext.value } : {}),
      ...(previous.args.period ? { period: previous.args.period } : context.period ? { period: context.period } : {}),
      ...(idsContext?.field === "deal_ids" ? { dealIds: idsContext.value } : {}),
    },
  };
}
