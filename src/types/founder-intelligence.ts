import type { PipelineMetrics } from "./domain";

export type CurrencyCode = "INR";

export interface AnalyticsProvenance {
  dealRecordsAnalyzed: number;
  workOrderRecordsAnalyzed: number;
  totalRecordsAnalyzed: number;
}

export interface PresentationMetadata {
  currencyCode: CurrencyCode;
  provenance: AnalyticsProvenance;
}

export interface PeriodPipelineSnapshot extends PresentationMetadata {
  period: string;
  recordsAnalyzed: number;
  pipeline: PipelineMetrics;
}

export interface PeriodPipelineResult extends PresentationMetadata {
  requestedPeriod: string;
  hasData: boolean;
  recordsAnalyzed: number;
  result: PeriodPipelineSnapshot | null;
  latestAvailablePeriod: string | null;
  latestAvailableResult: PeriodPipelineSnapshot | null;
  caveats: string[];
}

export interface SectorPeriodMetric {
  sector: string;
  dealCount: number;
  openDealCount: number;
  wonDealCount: number;
  knownValueDealCount: number;
  unknownValueDealCount: number;
  openPipelineValue: number;
  wonValue: number;
  totalKnownDealValue: number;
}

export interface PeriodSectorSnapshot extends PresentationMetadata {
  period: string;
  recordsAnalyzed: number;
  sectors: SectorPeriodMetric[];
}

export interface PeriodSectorResult extends PresentationMetadata {
  requestedPeriod: string;
  hasData: boolean;
  recordsAnalyzed: number;
  result: PeriodSectorSnapshot | null;
  latestAvailablePeriod: string | null;
  latestAvailableResult: PeriodSectorSnapshot | null;
  caveats: string[];
}

export type CustomerRankingType =
  | "won_value"
  | "open_pipeline"
  | "work_order_execution_health"
  | "combined_importance";

export interface CustomerRankingEntry {
  normalizedClientKey: string;
  rank: number;
  deterministicBasis: string;
  recordsUsed: {
    deals: number;
    workOrders: number;
    total: number;
  };
  monetaryValues: {
    wonValue: number;
    openPipelineValue: number;
    workOrderValueInclGst: number;
    receivables: number;
    combinedExposure: number;
    knownDealValueRecords: number;
    unknownDealValueRecords: number;
  };
  operationalValues: {
    workOrderCount: number;
    activeWorkOrders: number;
    delayedWorkOrders: number;
    pausedWorkOrders: number;
    arPriorityWorkOrders: number;
    executionRiskScore: number;
  };
  evidence: {
    dealItemIds: string[];
    workOrderItemIds: string[];
  };
  caveats: string[];
}

export interface CustomerRankingResult extends PresentationMetadata {
  rankingType: CustomerRankingType;
  entries: CustomerRankingEntry[];
  unmatchedDealRecordsExcluded: number;
  unmatchedWorkOrderRecordsExcluded: number;
  caveats: string[];
}

export type FounderAttentionSeverity = "HIGH" | "MEDIUM";

export type FounderAttentionSource = "deals" | "work_orders" | "cross_board";

export type FounderAttentionCategory =
  | "commercial_and_delivery"
  | "collections"
  | "pipeline_hygiene"
  | "delivery_execution"
  | "commercial_concentration";

export interface FounderAttentionItem {
  severity: FounderAttentionSeverity;
  title: string;
  client: string | null;
  entity: string;
  reason: string;
  evidenceMetrics: Record<string, string | number | boolean | null>;
  relevantSource: FounderAttentionSource;
  dataQualityCaveat: string | null;
  recommendedAttentionCategory: FounderAttentionCategory;
  evidence: {
    dealItemIds: string[];
    workOrderItemIds: string[];
  };
}

export interface FounderAttentionFeed extends PresentationMetadata {
  asOfDate: string;
  items: FounderAttentionItem[];
  caveats: string[];
}
