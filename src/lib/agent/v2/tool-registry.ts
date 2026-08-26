import {
  buildClientIntelligence,
  getCurrentQuarter,
  getDealPeriodDate,
  quarterForDate,
} from "@/lib/analytics";
import { executePlanAgainstSnapshot } from "@/lib/agent/analytics-adapter";
import type { BusinessDataSnapshot } from "@/lib/business-data";
import { assessEvidenceQuality } from "@/lib/semantic/evidence-quality";
import { buildAnswerLineage } from "@/lib/semantic/lineage";
import { buildTrustResponse } from "@/lib/semantic/trust";
import { CLIENT_EXACT_JOIN_ID } from "@/lib/semantic/joins";
import type { LineageFilter, TrustResponse } from "@/lib/semantic/types";
import type { AgentResponse, AnalyticsResult } from "@/types";
import type { QueryPlan } from "@/lib/agent/schemas";
import {
  type AnalysisFilter,
  type AnalysisPeriod,
  type BaseToolCall,
  type MetricId,
  type ToolCall,
  type ToolEvidence,
} from "./contracts";
import { executeCustomerContributionTool } from "./customer-contribution-tool";
import { applyScenarioOverrides } from "./scenario-engine";

export const APPROVED_TOOL_IDS = [
  "getPipelineSummary",
  "getPipelineBySector",
  "getPipelineByStage",
  "getCustomerContribution",
  "getCustomer360",
  "getReceivables",
  "getWorkOrderHealth",
  "getPeriodComparison",
  "runScenario",
] as const;

export interface RegisteredToolExecution {
  result: AnalyticsResult<unknown>;
  source: AgentResponse["source"];
  snapshotId: string;
  toolsUsed: ToolCall["tool"][];
  semanticMetricIds: MetricId[];
  filters: AnalysisFilter[];
  evidence: ToolEvidence;
  semanticTrust: TrustResponse;
  scenarioSemanticTrust?: TrustResponse;
}

function analysisDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function sourceForSnapshot(snapshot: BusinessDataSnapshot): AgentResponse["source"] {
  return {
    provider: "monday.com",
    boardIds: [snapshot.source.dealsBoardId, snapshot.source.workOrdersBoardId],
    fetchedAt: snapshot.source.fetchedAt,
  };
}

export function snapshotIdFor(snapshot: BusinessDataSnapshot): string {
  return `${snapshot.source.dealsBoardId}:${snapshot.source.workOrdersBoardId}:${snapshot.source.fetchedAt}`;
}

function previousQuarterLabel(current: string): string {
  const match = /^Q([1-4]) (20\d{2})$/.exec(current);
  if (!match) throw new Error("Current quarter could not be resolved.");
  const quarter = Number(match[1]);
  const year = Number(match[2]);
  return quarter === 1 ? `Q4 ${year - 1}` : `Q${quarter - 1} ${year}`;
}

export function resolvePeriod(period: AnalysisPeriod | undefined, asOfDate = analysisDate()): string | null {
  if (!period || period.kind === "all_time") return null;
  const current = getCurrentQuarter(asOfDate);
  if (period.kind === "current_quarter") return current;
  if (period.kind === "previous_quarter") return previousQuarterLabel(current);
  return period.value;
}

function cloneSnapshot(snapshot: BusinessDataSnapshot): BusinessDataSnapshot {
  return {
    deals: snapshot.deals.map((deal) => ({ ...deal, sourceQualityFlags: [...deal.sourceQualityFlags] })),
    workOrders: snapshot.workOrders.map((workOrder) => ({ ...workOrder, sourceQualityFlags: [...workOrder.sourceQualityFlags] })),
    normalizationIssues: snapshot.normalizationIssues.map((issue) => ({ ...issue })),
    source: { ...snapshot.source },
  };
}

function periodMatches(date: string | null, quarter: string | null): boolean {
  if (!quarter) return true;
  return date ? quarterForDate(date) === quarter : false;
}

function filtersForPipelineArgs(args: {
  sector?: string;
  stage?: string;
  minDealValue?: number;
}): AnalysisFilter[] {
  const filters: AnalysisFilter[] = [];
  if (args.sector) filters.push({ field: "sector", operator: "eq", value: args.sector });
  if (args.stage) filters.push({ field: "stage", operator: "eq", value: args.stage });
  if (args.minDealValue !== undefined) filters.push({ field: "deal_value", operator: "gte", value: args.minDealValue });
  return filters;
}

function applyFilters(
  baseline: BusinessDataSnapshot,
  filters: AnalysisFilter[],
  period?: AnalysisPeriod,
): BusinessDataSnapshot {
  const snapshot = cloneSnapshot(baseline);
  const quarter = resolvePeriod(period);
  const sector = filters.find((filter) => filter.field === "sector");
  const stage = filters.find((filter) => filter.field === "stage");
  const status = filters.find((filter) => filter.field === "status");
  const client = filters.find((filter) => filter.field === "client");
  const minDealValue = filters.find((filter) => filter.field === "deal_value" && filter.operator === "gte");
  const maxDealValue = filters.find((filter) => filter.field === "deal_value" && filter.operator === "lte");
  const dealIds = filters.find((filter) => filter.field === "deal_ids");
  const workOrderIds = filters.find((filter) => filter.field === "work_order_ids");

  snapshot.deals = snapshot.deals.filter((deal) => {
    if (!periodMatches(getDealPeriodDate(deal), quarter)) return false;
    if (sector?.field === "sector" && (deal.sector ?? "").toLowerCase() !== sector.value.toLowerCase()) return false;
    if (stage?.field === "stage" && (deal.stage ?? "").toLowerCase() !== stage.value.toLowerCase()) return false;
    if (status?.field === "status" && (deal.status ?? "").toLowerCase() !== status.value.toLowerCase()) return false;
    if (client?.field === "client" && deal.normalizedClientKey !== client.value) return false;
    if (minDealValue?.field === "deal_value" && (deal.value === null || deal.value < minDealValue.value)) return false;
    if (maxDealValue?.field === "deal_value" && (deal.value === null || deal.value > maxDealValue.value)) return false;
    if (dealIds?.field === "deal_ids" && !dealIds.value.includes(deal.mondayItemId)) return false;
    return true;
  });

  snapshot.workOrders = snapshot.workOrders.filter((workOrder) => {
    if (sector?.field === "sector" && (workOrder.sector ?? "").toLowerCase() !== sector.value.toLowerCase()) return false;
    if (client?.field === "client" && workOrder.normalizedClientKey !== client.value) return false;
    if (workOrderIds?.field === "work_order_ids" && !workOrderIds.value.includes(workOrder.mondayItemId)) return false;
    return true;
  });
  return snapshot;
}

function evidenceFor(snapshot: BusinessDataSnapshot): ToolEvidence {
  return {
    dealItemIds: snapshot.deals.map((deal) => deal.mondayItemId).slice(0, 50),
    workOrderItemIds: snapshot.workOrders.map((workOrder) => workOrder.mondayItemId).slice(0, 50),
    dealCount: snapshot.deals.length,
    workOrderCount: snapshot.workOrders.length,
  };
}

function mergeEvidence(...items: ToolEvidence[]): ToolEvidence {
  const dealIds = new Set<string>();
  const workOrderIds = new Set<string>();
  let dealCount = 0;
  let workOrderCount = 0;
  for (const evidence of items) {
    for (const id of evidence.dealItemIds) dealIds.add(id);
    for (const id of evidence.workOrderItemIds) workOrderIds.add(id);
    dealCount = Math.max(dealCount, evidence.dealCount);
    workOrderCount = Math.max(workOrderCount, evidence.workOrderCount);
  }
  return {
    dealItemIds: [...dealIds].slice(0, 50),
    workOrderItemIds: [...workOrderIds].slice(0, 50),
    dealCount,
    workOrderCount,
  };
}

function semanticLineageFilters(filters: AnalysisFilter[]): LineageFilter[] {
  const lineageFilters: LineageFilter[] = [];
  for (const filter of filters) {
    if (filter.field === "sector" || filter.field === "stage" || filter.field === "client" || filter.field === "status") {
      lineageFilters.push({ dimension: filter.field, operator: "eq", values: [filter.value] });
    }
    if (filter.field === "deal_value") {
      lineageFilters.push({ field: "deal_value", operator: filter.operator, value: filter.value });
    }
    if (filter.field === "deal_ids") {
      lineageFilters.push({ field: "deal_ids", operator: "in", values: filter.value });
    }
  }
  return lineageFilters;
}

function issueCounts(snapshot: BusinessDataSnapshot) {
  return snapshot.normalizationIssues.reduce(
    (counts, issue) => ({ ...counts, [issue.severity]: counts[issue.severity] + 1 }),
    { info: 0, warning: 0, error: 0 },
  );
}

function trustFor(
  snapshot: BusinessDataSnapshot,
  metricIds: MetricId[],
  filters: AnalysisFilter[],
  period?: AnalysisPeriod,
  joined = false,
): TrustResponse {
  const resolvedPeriod = resolvePeriod(period);
  const analysisTimestamp = new Date().toISOString();
  const lineageFilters = semanticLineageFilters(filters);
  if (resolvedPeriod) lineageFilters.push({ dimension: "quarter", operator: "eq", values: [resolvedPeriod] });
  const lineage = buildAnswerLineage({
    metricIds,
    snapshot,
    analysisTimestamp,
    filters: lineageFilters,
    timeRange: resolvedPeriod
      ? { dimension: "quarter", label: resolvedPeriod }
      : undefined,
    joinIds: joined ? [CLIENT_EXACT_JOIN_ID] : undefined,
  });
  const quality = assessEvidenceQuality({
    lineage,
    sourceQualityIssues: issueCounts(snapshot),
    temporalCoverage: period && period.kind !== "all_time"
      ? {
          requested: true,
          covered: snapshot.deals.length > 0,
          reason: snapshot.deals.length > 0
            ? `The deterministic tool found source Deal records for ${resolvedPeriod ?? "the requested period"}.`
            : `No source Deal records matched ${resolvedPeriod ?? "the requested period"}.`,
        }
      : { requested: false, covered: true },
  });
  return buildTrustResponse(lineage, quality);
}

function roundDelta(value: number): number {
  return Math.round(value * 100) / 100;
}

export function deterministicDelta(baseline: unknown, scenario: unknown): unknown {
  if (typeof baseline === "number" && typeof scenario === "number") {
    return roundDelta(scenario - baseline);
  }
  if (Array.isArray(baseline) && Array.isArray(scenario)) {
    const keyOf = (value: unknown): string | null => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const record = value as Record<string, unknown>;
      for (const key of ["sector", "stage", "normalizedClientKey", "mondayItemId", "period"]) {
        if (typeof record[key] === "string") return `${key}:${record[key]}`;
      }
      return null;
    };
    const baselineMap = new Map(baseline.flatMap((item) => {
      const key = keyOf(item);
      return key ? [[key, item] as const] : [];
    }));
    const scenarioMap = new Map(scenario.flatMap((item) => {
      const key = keyOf(item);
      return key ? [[key, item] as const] : [];
    }));
    if (baselineMap.size || scenarioMap.size) {
      return [...new Set([...baselineMap.keys(), ...scenarioMap.keys()])].sort().map((key) => ({
        key,
        delta: deterministicDelta(baselineMap.get(key), scenarioMap.get(key)),
      }));
    }
    return undefined;
  }
  if (baseline && scenario && typeof baseline === "object" && typeof scenario === "object" && !Array.isArray(baseline) && !Array.isArray(scenario)) {
    const left = baseline as Record<string, unknown>;
    const right = scenario as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      const delta = deterministicDelta(left[key], right[key]);
      if (delta !== undefined) output[key] = delta;
    }
    return output;
  }
  return undefined;
}

function metricIdsFor(call: BaseToolCall): MetricId[] {
  switch (call.tool) {
    case "getPipelineSummary":
      return ["open_pipeline_value", "known_won_value", "open_deal_count", "won_deal_count"];
    case "getPipelineBySector":
      return ["open_pipeline_value", "known_won_value", "open_deal_count"];
    case "getPipelineByStage":
      return ["open_pipeline_value", "open_deal_count"];
    case "getCustomerContribution":
      return [call.args.metricId ?? (call.args.status === "Won" ? "known_won_value" : "open_pipeline_value")];
    case "getCustomer360":
      return ["open_pipeline_value", "receivables", "total_work_order_value", "active_work_order_count"];
    case "getReceivables":
      return ["receivables", "collected_value", "billed_value", "to_be_billed"];
    case "getWorkOrderHealth":
      return ["active_work_order_count", "total_work_order_value", "receivables", "billed_value", "collected_value", "to_be_billed"];
    case "getPeriodComparison":
      return [call.args.metricId];
  }
}

function comparisonBaseCall(call: Extract<BaseToolCall, { tool: "getPeriodComparison" }>, period: AnalysisPeriod): BaseToolCall {
  const sectorFilter = call.args.filters.find((filter) => filter.field === "sector");
  const stageFilter = call.args.filters.find((filter) => filter.field === "stage");
  const minValueFilter = call.args.filters.find((filter) => filter.field === "deal_value" && filter.operator === "gte");
  const sector = call.args.dimension === "sector" && call.args.entity
    ? call.args.entity
    : sectorFilter?.field === "sector"
      ? sectorFilter.value
      : undefined;
  const stage = call.args.dimension === "stage" && call.args.entity
    ? call.args.entity
    : stageFilter?.field === "stage"
      ? stageFilter.value
      : undefined;
  const minDealValue = minValueFilter?.field === "deal_value" ? minValueFilter.value : undefined;
  if (call.args.dimension === "sector") {
    return { tool: "getPipelineBySector", args: { sector, minDealValue, period } };
  }
  if (call.args.dimension === "stage") {
    return { tool: "getPipelineByStage", args: { stage, minDealValue, period } };
  }
  return { tool: "getPipelineSummary", args: { sector, stage, minDealValue, period } };
}

async function executeBaseTool(call: BaseToolCall, baseline: BusinessDataSnapshot): Promise<RegisteredToolExecution> {
  const source = sourceForSnapshot(baseline);
  const snapshotId = snapshotIdFor(baseline);

  if (call.tool === "getPeriodComparison") {
    const fromCall = comparisonBaseCall(call, call.args.from);
    const toCall = comparisonBaseCall(call, call.args.to);
    const from = await executeBaseTool(fromCall, baseline);
    const to = await executeBaseTool(toCall, baseline);
    return {
      result: {
        data: {
          kind: "period_comparison",
          from: { period: call.args.from, result: from.result.data },
          to: { period: call.args.to, result: to.result.data },
          delta: deterministicDelta(from.result.data, to.result.data),
        },
        caveats: [...new Set([
          ...from.result.caveats,
          ...to.result.caveats,
          "Semantic trust details correspond to the comparison target period; evidence IDs cover both deterministic period executions.",
        ])],
      },
      source,
      snapshotId,
      toolsUsed: ["getPeriodComparison", fromCall.tool, toCall.tool],
      semanticMetricIds: metricIdsFor(call),
      filters: call.args.filters,
      evidence: mergeEvidence(from.evidence, to.evidence),
      semanticTrust: to.semanticTrust,
    };
  }

  if (call.tool === "getCustomerContribution") {
    const execution = executeCustomerContributionTool(call, baseline, resolvePeriod(call.args.period));
    return {
      ...execution,
      source,
      snapshotId,
      toolsUsed: [call.tool],
    };
  }

  if (call.tool === "getCustomer360") {
    const filters: AnalysisFilter[] = [{ field: "client", operator: "eq", value: call.args.customerKey }];
    const scoped = applyFilters(baseline, filters);
    const row = buildClientIntelligence(scoped.deals, scoped.workOrders, analysisDate())
      .find((client) => client.normalizedClientKey === call.args.customerKey) ?? null;
    const metricIds = metricIdsFor(call);
    return {
      result: {
        data: row,
        caveats: row ? [] : [`No normalized customer matched “${call.args.customerKey}”.`],
      },
      source,
      snapshotId,
      toolsUsed: [call.tool],
      semanticMetricIds: metricIds,
      filters,
      evidence: evidenceFor(scoped),
      semanticTrust: trustFor(scoped, metricIds, filters, undefined, true),
    };
  }

  if (call.tool === "getReceivables" || call.tool === "getWorkOrderHealth") {
    const filters: AnalysisFilter[] = call.args.customerKey
      ? [{ field: "client", operator: "eq", value: call.args.customerKey }]
      : [];
    const scoped = applyFilters(baseline, filters);
    const plan: QueryPlan = {
      intent: call.tool === "getReceivables" ? "receivables" : "work_order_health",
      confidence: 1,
    };
    const metricIds = metricIdsFor(call);
    return {
      result: executePlanAgainstSnapshot(plan, scoped),
      source,
      snapshotId,
      toolsUsed: [call.tool],
      semanticMetricIds: metricIds,
      filters,
      evidence: evidenceFor(scoped),
      semanticTrust: trustFor(scoped, metricIds, filters),
    };
  }

  const filters = filtersForPipelineArgs(call.args);
  const scoped = applyFilters(baseline, filters, call.args.period);
  const plan: QueryPlan = {
    intent: call.tool === "getPipelineBySector"
      ? "pipeline_by_sector"
      : call.tool === "getPipelineByStage"
        ? "pipeline_by_stage"
        : "pipeline_overview",
    confidence: 1,
  };
  const result = executePlanAgainstSnapshot(plan, scoped);
  const periodLabel = resolvePeriod(call.args.period);
  if (periodLabel) {
    result.caveats = [...result.caveats, `V2 tool scope is restricted deterministically to ${periodLabel}.`];
  }
  if (filters.some((filter) => filter.field === "deal_value")) {
    result.caveats = [...result.caveats, "The explicit Deal-value threshold is enforced by the V2 tool pre-filter and is shown in the Copilot filter trace; semantic lineage records the same deterministic predicate."];
  }
  const metricIds = metricIdsFor(call);
  return {
    result,
    source,
    snapshotId,
    toolsUsed: [call.tool],
    semanticMetricIds: metricIds,
    filters,
    evidence: evidenceFor(scoped),
    semanticTrust: trustFor(scoped, metricIds, filters, call.args.period),
  };
}

export async function executeRegisteredTool(call: ToolCall, baseline: BusinessDataSnapshot): Promise<RegisteredToolExecution> {
  if (call.tool !== "runScenario") return executeBaseTool(call, baseline);

  const applied = applyScenarioOverrides(baseline, call.args.overrides);
  const baselineExecution = await executeBaseTool(call.args.analysis, baseline);
  const scenarioExecution = await executeBaseTool(call.args.analysis, applied.snapshot);
  const touchedEvidence: ToolEvidence = {
    dealItemIds: applied.touchedDealIds,
    workOrderItemIds: applied.touchedWorkOrderIds,
    dealCount: applied.touchedDealIds.length,
    workOrderCount: applied.touchedWorkOrderIds.length,
  };

  return {
    result: {
      data: {
        kind: "scenario_comparison",
        baseline: baselineExecution.result.data,
        scenario: scenarioExecution.result.data,
        delta: deterministicDelta(baselineExecution.result.data, scenarioExecution.result.data),
        overrides: call.args.overrides,
      },
      caveats: [...new Set([
        ...applied.caveats,
        ...baselineExecution.result.caveats,
        ...scenarioExecution.result.caveats,
        "BASELINE and SCENARIO are independently rerun through the same deterministic analytics tool; DELTA is a deterministic field-by-field comparison.",
        "Scenario semantic trust is evaluated separately from the immutable baseline trust and is clearly hypothetical.",
      ])],
    },
    source: sourceForSnapshot(baseline),
    snapshotId: snapshotIdFor(baseline),
    toolsUsed: ["runScenario", ...scenarioExecution.toolsUsed],
    semanticMetricIds: scenarioExecution.semanticMetricIds,
    filters: scenarioExecution.filters,
    evidence: mergeEvidence(scenarioExecution.evidence, touchedEvidence),
    semanticTrust: baselineExecution.semanticTrust,
    scenarioSemanticTrust: scenarioExecution.semanticTrust,
  };
}

export function legacyPlanForTool(call: ToolCall): QueryPlan {
  const base = call.tool === "runScenario" ? call.args.analysis : call;
  switch (base.tool) {
    case "getPipelineSummary": return { intent: "pipeline_overview", confidence: 1 };
    case "getPipelineBySector": return { intent: "pipeline_by_sector", confidence: 1 };
    case "getPipelineByStage": return { intent: "pipeline_by_stage", confidence: 1 };
    case "getCustomerContribution": return { intent: "client_cross_board", confidence: 1 };
    case "getCustomer360": return { intent: "client_cross_board", confidence: 1 };
    case "getReceivables": return { intent: "receivables", confidence: 1 };
    case "getWorkOrderHealth": return { intent: "work_order_health", confidence: 1 };
    case "getPeriodComparison": return { intent: "quarter_analysis", confidence: 1 };
  }
}
