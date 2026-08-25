import type { BusinessDataSnapshot } from "@/lib/business-data";
import { executePlanAgainstSnapshot } from "@/lib/agent/analytics-adapter";
import type { QueryPlan } from "@/lib/agent/schemas";
import type { AnalyticsResult, PipelineMetrics, SectorMetrics, WorkOrderHealth } from "@/types";
import { assertMetricDimensions } from "./dimensions";
import { assessEvidenceQuality } from "./evidence-quality";
import { buildAnswerLineage } from "./lineage";
import { buildTrustResponse } from "./trust";
import type {
  AnswerLineage,
  CanonicalQuestionId,
  DimensionId,
  EvidenceQuality,
  LineageFilter,
  MetricId,
  TrustResponse,
} from "./types";

export interface CanonicalQuestionDefinition {
  id: CanonicalQuestionId;
  question: string;
  metricIds: MetricId[];
  dimensions: DimensionId[];
  plan: QueryPlan;
  description: string;
}

export interface SemanticMetricValue {
  metricId: MetricId;
  value: number | null;
  dimensions?: Partial<Record<DimensionId, string>>;
}

export interface CanonicalQuestionResult {
  definition: CanonicalQuestionDefinition;
  metricValues: SemanticMetricValue[];
  analyticsResult: AnalyticsResult<unknown>;
  lineage: AnswerLineage;
  evidenceQuality: EvidenceQuality;
  trust: TrustResponse;
}

export const CANONICAL_QUESTIONS: Record<CanonicalQuestionId, CanonicalQuestionDefinition> = {
  open_pipeline: {
    id: "open_pipeline",
    question: "What is open pipeline?",
    metricIds: ["open_pipeline_value", "open_deal_count"],
    dimensions: [],
    plan: { intent: "pipeline_overview", confidence: 1 },
    description: "Returns canonical open-pipeline value and open Deal count from deterministic pipeline analytics.",
  },
  won_value: {
    id: "won_value",
    question: "What is won value?",
    metricIds: ["known_won_value", "won_deal_count"],
    dimensions: [],
    plan: { intent: "won_value", confidence: 1 },
    description: "Returns canonical known won value and Won Deal count with explicit monetary coverage semantics.",
  },
  receivables: {
    id: "receivables",
    question: "What are receivables?",
    metricIds: ["receivables"],
    dimensions: [],
    plan: { intent: "receivables", focus: "receivables", confidence: 1 },
    description: "Returns canonical Work Order receivables from deterministic Work Order health analytics.",
  },
  largest_open_sector: {
    id: "largest_open_sector",
    question: "Which sector has the largest open opportunity?",
    metricIds: ["open_pipeline_value", "open_deal_count"],
    dimensions: ["sector"],
    plan: { intent: "pipeline_by_sector", focus: "sector_open_pipeline", confidence: 1 },
    description: "Uses the canonical sector-open-pipeline focus, which orders deterministic sector metrics by known open pipeline value.",
  },
};

function assertDefinitionDimensions(definition: CanonicalQuestionDefinition): void {
  for (const metricId of definition.metricIds) {
    assertMetricDimensions(metricId, definition.dimensions);
  }
}

function pipelineValues(data: unknown, won: boolean): SemanticMetricValue[] {
  const pipeline = data as PipelineMetrics;
  return won
    ? [
        { metricId: "known_won_value", value: pipeline.wonValue },
        { metricId: "won_deal_count", value: pipeline.wonDeals },
      ]
    : [
        { metricId: "open_pipeline_value", value: pipeline.openPipelineValue },
        { metricId: "open_deal_count", value: pipeline.openDeals },
      ];
}

function receivableValues(data: unknown): SemanticMetricValue[] {
  const workOrders = data as WorkOrderHealth;
  return [{ metricId: "receivables", value: workOrders.receivables }];
}

function sectorValues(data: unknown): SemanticMetricValue[] {
  const sectors = data as SectorMetrics[];
  const top = sectors[0];
  if (!top) {
    return [
      { metricId: "open_pipeline_value", value: null },
      { metricId: "open_deal_count", value: null },
    ];
  }
  return [
    {
      metricId: "open_pipeline_value",
      value: top.openPipelineValue,
      dimensions: { sector: top.sector },
    },
    {
      metricId: "open_deal_count",
      value: top.openDealCount,
      dimensions: { sector: top.sector },
    },
  ];
}

function metricValuesFor(
  id: CanonicalQuestionId,
  analyticsResult: AnalyticsResult<unknown>,
): SemanticMetricValue[] {
  switch (id) {
    case "open_pipeline": return pipelineValues(analyticsResult.data, false);
    case "won_value": return pipelineValues(analyticsResult.data, true);
    case "receivables": return receivableValues(analyticsResult.data);
    case "largest_open_sector": return sectorValues(analyticsResult.data);
  }
}

function lineageFilters(
  id: CanonicalQuestionId,
  metricValues: SemanticMetricValue[],
): LineageFilter[] {
  switch (id) {
    case "open_pipeline":
      return [{ dimension: "status", operator: "eq", values: ["Open"] }];
    case "won_value":
      return [{ dimension: "status", operator: "eq", values: ["Won"] }];
    case "receivables":
      return [];
    case "largest_open_sector": {
      const sector = metricValues[0]?.dimensions?.sector;
      return [
        { dimension: "status", operator: "eq", values: ["Open"] },
        ...(sector ? [{ dimension: "sector", operator: "eq", values: [sector] } as LineageFilter] : []),
      ];
    }
  }
}

export function getCanonicalQuestionDefinition(id: CanonicalQuestionId): CanonicalQuestionDefinition {
  return CANONICAL_QUESTIONS[id];
}

export function executeCanonicalQuestion(
  id: CanonicalQuestionId,
  snapshot: BusinessDataSnapshot,
  analysisTimestamp: string,
): CanonicalQuestionResult {
  const definition = getCanonicalQuestionDefinition(id);
  assertDefinitionDimensions(definition);
  const analyticsResult = executePlanAgainstSnapshot(definition.plan, snapshot);
  const metricValues = metricValuesFor(id, analyticsResult);
  const lineage = buildAnswerLineage({
    metricIds: definition.metricIds,
    snapshot,
    analysisTimestamp,
    filters: lineageFilters(id, metricValues),
  });
  const evidenceQuality = assessEvidenceQuality({
    lineage,
    sourceQualityIssues: analyticsResult.dataQuality?.issueCounts,
  });
  const trust = buildTrustResponse(lineage, evidenceQuality);

  return {
    definition,
    metricValues,
    analyticsResult,
    lineage,
    evidenceQuality,
    trust,
  };
}
