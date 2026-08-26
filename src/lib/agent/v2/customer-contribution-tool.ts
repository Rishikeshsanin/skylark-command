import { calculateCustomerContribution } from "@/lib/analytics/customer-contribution";
import type { BusinessDataSnapshot } from "@/lib/business-data";
import { assessEvidenceQuality } from "@/lib/semantic/evidence-quality";
import { buildAnswerLineage } from "@/lib/semantic/lineage";
import { buildTrustResponse } from "@/lib/semantic/trust";
import type { LineageFilter, TrustResponse } from "@/lib/semantic/types";
import type { AnalyticsResult } from "@/types";
import type {
  AnalysisFilter,
  AnalysisPeriod,
  BaseToolCall,
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

export function executeCustomerContributionTool(
  call: CustomerContributionCall,
  baseline: BusinessDataSnapshot,
  resolvedPeriod: string | null,
): CustomerContributionToolExecution {
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
