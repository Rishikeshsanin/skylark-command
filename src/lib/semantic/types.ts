export type SemanticVersion = `${number}.${number}.${number}`;

export type MetricId =
  | "open_pipeline_value"
  | "known_won_value"
  | "receivables"
  | "total_work_order_value"
  | "billed_value"
  | "collected_value"
  | "to_be_billed"
  | "open_deal_count"
  | "won_deal_count"
  | "active_work_order_count";

export type DimensionId =
  | "sector"
  | "stage"
  | "client"
  | "quarter"
  | "status"
  | "work_order_status"
  | "billing_status"
  | "collection_status";

export type SourceEntity = "deal" | "work_order";
export type MetricUnit = "INR" | "count";
export type AggregationType = "sum" | "count";

export interface MetricDefinition {
  id: MetricId;
  label: string;
  description: string;
  unit: MetricUnit;
  aggregation: AggregationType;
  nullSemantics: string;
  sourceEntities: SourceEntity[];
  validDimensions: DimensionId[];
  coverageSemantics: {
    tracked: boolean;
    known: string;
    unknown: string;
  };
  semanticVersion: SemanticVersion;
  canonicalAnalytics: string;
  canonicalField: string;
}

export interface DimensionDefinition {
  id: DimensionId;
  label: string;
  description: string;
  sourceEntities: SourceEntity[];
  canonicalFields: Partial<Record<SourceEntity, string>>;
  semanticVersion: SemanticVersion;
}

export interface JoinDefinition {
  id: string;
  label: string;
  leftEntity: SourceEntity;
  rightEntity: SourceEntity;
  leftKey: string;
  rightKey: string;
  matchType: "exact";
  cardinality: "many_to_many";
  normalization: string;
  unmatchedSemantics: string;
  fuzzyMatchingAllowed: false;
  semanticVersion: SemanticVersion;
}

export interface LineageFilter {
  dimension: DimensionId;
  operator: "eq" | "in";
  values: string[];
}

export interface LineageTimeRange {
  dimension: "quarter";
  label: string;
  from?: string;
  to?: string;
}

export interface SourceBoardLineage {
  entity: SourceEntity;
  boardId: string;
  boardName?: string;
}

export interface RecordReference {
  entity: SourceEntity;
  id: string;
}

export interface ExcludedRecordReference extends RecordReference {
  reasons: string[];
}

export interface MetricRecordLineage {
  metricId: MetricId;
  recordsIncluded: RecordReference[];
  recordsExcluded: ExcludedRecordReference[];
  knownValueCount: number | null;
  unknownValueCount: number | null;
}

export interface JoinLineage {
  joinId: string;
  totalKeys: number;
  matchedKeys: number;
  unmatchedKeys: number;
  unmatchedKeyValues: string[];
}

export interface AnswerLineage {
  metricIds: MetricId[];
  filters: LineageFilter[];
  timeRange?: LineageTimeRange;
  sourceSnapshot: {
    provider: "monday.com";
    fetchedAt: string;
  };
  sourceBoards: SourceBoardLineage[];
  recordsIncluded: RecordReference[];
  recordsExcluded: ExcludedRecordReference[];
  metricRecords: MetricRecordLineage[];
  joinPath: JoinLineage[];
  semanticVersions: Record<MetricId, SemanticVersion>;
  analysisTimestamp: string;
}

export type EvidenceQualityClass = "Strong" | "Moderate" | "Limited";
export type EvidenceQualityFactorId =
  | "completeness"
  | "freshness"
  | "join_coverage"
  | "temporal_coverage"
  | "source_quality";

export interface EvidenceQualityFactor {
  id: EvidenceQualityFactorId;
  status: EvidenceQualityClass;
  reason: string;
}

export interface EvidenceQuality {
  status: EvidenceQualityClass;
  reasons: string[];
  factors: EvidenceQualityFactor[];
  policyVersion: SemanticVersion;
}

export interface EvidenceQualityInput {
  lineage: AnswerLineage;
  sourceQualityIssues?: {
    info: number;
    warning: number;
    error: number;
  };
  temporalCoverage?: {
    requested: boolean;
    covered: boolean;
    partial?: boolean;
    reason?: string;
  };
}

export interface TrustResponse {
  kind: "semantic_trust";
  question: "Why should I trust this result?";
  evidenceQuality: EvidenceQuality;
  metrics: MetricDefinition[];
  lineage: AnswerLineage;
  joins: JoinDefinition[];
  deterministicBoundary: string;
  limitations: string[];
}

export type CanonicalQuestionId =
  | "open_pipeline"
  | "won_value"
  | "receivables"
  | "largest_open_sector";
