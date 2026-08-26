import type { DataQualityIssue, Deal, WorkOrder } from "./domain";
import type { FounderAttentionItem } from "./founder-intelligence";

export type ChangeSignalType =
  | "open_pipeline_change"
  | "receivables_change"
  | "deal_newly_won"
  | "deal_newly_lost"
  | "deal_stage_movement"
  | "deal_new_large_opportunity"
  | "deal_tentative_close_movement"
  | "deal_newly_stale"
  | "work_order_newly_delayed"
  | "work_order_newly_paused"
  | "billing_collection_deterioration"
  | "customer_exposure_change"
  | "sector_concentration_change";

export type ChangeDirection =
  | "increase"
  | "decrease"
  | "new"
  | "changed"
  | "deteriorated";

export type ChangeMethodName =
  | "absolute_delta"
  | "percentage_delta"
  | "rolling_median_mad"
  | "percentile_threshold"
  | "state_transition";

export type ChangeMetricValue = number | string | boolean | null;

export interface HistoricalBusinessSnapshot {
  snapshotId: string;
  capturedAt: string;
  deals: Deal[];
  workOrders: WorkOrder[];
  normalizationIssues?: DataQualityIssue[];
}

export interface ChangeMethod {
  name: ChangeMethodName;
  description: string;
  parameters: Record<string, string | number | boolean | null>;
}

export interface ChangeEvidence {
  dealItemIds: string[];
  workOrderItemIds: string[];
}

export interface ChangeDataCompleteness {
  knownRecords: number;
  unknownRecords: number;
  note: string;
}

export interface ChangeSignal {
  id: string;
  type: ChangeSignalType;
  title: string;
  whatChanged: string;
  direction: ChangeDirection;
  metric: string;
  oldValue: ChangeMetricValue;
  newValue: ChangeMetricValue;
  delta: number | null;
  percentageDelta: number | null;
  timeWindow: {
    from: string;
    to: string;
  };
  method: ChangeMethod;
  evidence: ChangeEvidence;
  dataCompleteness: ChangeDataCompleteness;
  sourceSnapshotIds: {
    from: string;
    to: string;
  };
  affected: {
    customer: string | null;
    sector: string | null;
    entityId: string | null;
    entityName: string | null;
  };
}

export interface ChangeIntelligenceResult {
  snapshotCount: number;
  uniqueSnapshotCount: number;
  fromSnapshotId: string | null;
  toSnapshotId: string | null;
  timeWindow: {
    from: string | null;
    to: string | null;
  };
  signals: ChangeSignal[];
  caveats: string[];
}

export interface RobustDistributionSummary {
  count: number;
  median: number | null;
  mad: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  p90: number | null;
}

export interface Customer360DealStage {
  stage: string;
  dealCount: number;
  knownValue: number;
  unknownValueDeals: number;
}

export interface Customer360HistoryPoint {
  snapshotId: string;
  capturedAt: string;
  openDeals: number;
  wonDeals: number;
  knownOpenPipelineValue: number;
  knownWonValue: number;
  activeWorkOrders: number;
  delayedWorkOrders: number;
  receivables: number;
  billedValueInclGst: number;
  collectedAmountInclGst: number;
}

export interface Customer360 {
  normalizedClientKey: string;
  commercial: {
    openDeals: Deal[];
    wonDeals: Deal[];
    allDeals: Deal[];
    knownOpenPipelineValue: number;
    knownWonValue: number;
    dealStages: Customer360DealStage[];
    knownDealValueRecords: number;
    unknownDealValueRecords: number;
  };
  operations: {
    workOrders: WorkOrder[];
    totalWorkOrders: number;
    activeWorkOrders: number;
    completedWorkOrders: number;
    delayedWorkOrders: number;
    pausedWorkOrders: number;
    executionStatusDistribution: Record<string, number>;
  };
  cash: {
    knownWorkOrderValueInclGst: number;
    billedValueInclGst: number;
    collectedAmountInclGst: number;
    receivables: number;
    amountToBeBilledInclGst: number;
    arPriorityWorkOrders: number;
    unknownWorkOrderValueRecords: number;
    unknownReceivableRecords: number;
  };
  trust: {
    matchedAcrossBoards: boolean;
    joinEvidence: {
      dealItemIds: string[];
      workOrderItemIds: string[];
    };
    dataQualityIssues: DataQualityIssue[];
    knownDealValueRecords: number;
    unknownDealValueRecords: number;
    knownWorkOrderValueRecords: number;
    unknownWorkOrderValueRecords: number;
    knownReceivableRecords: number;
    unknownReceivableRecords: number;
    caveats: string[];
  };
  history: Customer360HistoryPoint[];
  attention: {
    founderAttentionItems: FounderAttentionItem[];
    changeSignals: ChangeSignal[];
  };
}
