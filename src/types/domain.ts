export type Nullable<T> = T | null;

export type DealStatus =
  | "Open"
  | "On Hold"
  | "Dead"
  | "Won"
  | "Working on it"
  | "Stuck"
  | "Done"
  | string;

export type ClosureProbability = "High" | "Medium" | "Low" | string;

export type WorkOrderExecutionStatus =
  | "Completed"
  | "Not Started"
  | "Executed until current month"
  | "Ongoing"
  | "Pause / struck"
  | "Partial Completed"
  | "Details pending from Client"
  | "Working on it"
  | "Stuck"
  | "Done"
  | string;

export type DataQualitySeverity = "info" | "warning" | "error";

export type DataQualityEntityType = "deal" | "work_order" | "dataset";

/**
 * Normalized deal model consumed by deterministic analytics and the AI layer.
 * Missing/invalid source values stay null; they must never be fabricated.
 */
export interface Deal {
  mondayItemId: string;
  name: string;
  ownerCode: Nullable<string>;
  clientCode: Nullable<string>;
  normalizedClientKey: Nullable<string>;
  status: Nullable<DealStatus>;
  closeDate: Nullable<string>;
  closureProbability: Nullable<ClosureProbability>;
  value: Nullable<number>;
  tentativeCloseDate: Nullable<string>;
  stage: Nullable<string>;
  productDeal: Nullable<string>;
  sector: Nullable<string>;
  createdDate: Nullable<string>;
  sourceRow: Nullable<number>;
  sourceQualityFlags: string[];
  malformed: boolean;
}

/**
 * Normalized Work Order model. Currency amounts preserve the board's stated
 * GST basis in their field names so downstream consumers cannot accidentally
 * mix inclusive/exclusive figures.
 */
export interface WorkOrder {
  mondayItemId: string;
  name: string;
  customerCode: Nullable<string>;
  normalizedClientKey: Nullable<string>;
  serialNumber: Nullable<string>;
  natureOfWork: Nullable<string>;
  lastExecutedMonth: Nullable<string>;
  executionStatus: Nullable<WorkOrderExecutionStatus>;
  dataDeliveryDate: Nullable<string>;
  poDate: Nullable<string>;
  documentType: Nullable<string>;
  probableStartDate: Nullable<string>;
  probableEndDate: Nullable<string>;
  bdKamPersonnelCode: Nullable<string>;
  sector: Nullable<string>;
  typeOfWork: Nullable<string>;
  softwarePlatform: Nullable<string>;
  lastInvoiceDate: Nullable<string>;
  latestInvoiceNumber: Nullable<string>;
  amountExclGst: Nullable<number>;
  amountInclGst: Nullable<number>;
  billedValueExclGst: Nullable<number>;
  billedValueInclGst: Nullable<number>;
  collectedAmountInclGst: Nullable<number>;
  amountToBeBilledExclGst: Nullable<number>;
  amountToBeBilledInclGst: Nullable<number>;
  amountReceivable: Nullable<number>;
  arPriority: Nullable<string>;
  quantityByOps: Nullable<number>;
  quantitiesAsPerPo: Nullable<string>;
  quantityBilledTillDate: Nullable<number>;
  balanceQuantity: Nullable<number>;
  invoiceStatus: Nullable<string>;
  expectedBillingMonth: Nullable<string>;
  actualBillingMonth: Nullable<string>;
  actualCollectionMonth: Nullable<string>;
  woStatusBilled: Nullable<string>;
  collectionStatus: Nullable<string>;
  collectionDate: Nullable<string>;
  billingStatus: Nullable<string>;
  sourceRow: Nullable<number>;
  sourceQualityFlags: string[];
  malformed: boolean;
}

export interface DataQualityIssue {
  code: string;
  severity: DataQualitySeverity;
  entityType: DataQualityEntityType;
  entityId?: string;
  field?: string;
  message: string;
  rawValue?: string;
}

export interface DataQualityIssueCounts {
  info: number;
  warning: number;
  error: number;
}

export interface DataQualityReport {
  totalDeals: number;
  totalWorkOrders: number;
  malformedDeals: number;
  malformedWorkOrders: number;
  unmappedWorkOrderClients: number;
  unmappedWorkOrderClientKeys: string[];
  issueCounts: DataQualityIssueCounts;
  issues: DataQualityIssue[];
}

export interface AnalyticsResult<T> {
  data: T;
  caveats: string[];
  dataQuality?: DataQualityReport;
}

export interface PipelineMetrics {
  totalDeals: number;
  openDeals: number;
  activeDeals: number;
  wonDeals: number;
  deadDeals: number;
  openPipelineValue: number;
  wonValue: number;
  averageOpenDealSize: Nullable<number>;
  knownOpenValueDeals: number;
  unknownOpenValueDeals: number;
  knownWonValueDeals: number;
  unknownWonValueDeals: number;
}

export interface StageMetric {
  stage: string;
  dealCount: number;
  knownValueDealCount: number;
  unknownValueDealCount: number;
  totalValue: number;
}

export interface SectorMetrics {
  sector: string;
  dealCount: number;
  openDealCount: number;
  openPipelineValue: number;
  wonValue: number;
  workOrderCount: number;
  activeWorkOrderCount: number;
  workOrderValueInclGst: number;
  receivables: number;
}

export interface QuarterMetric {
  quarter: string;
  dealCount: number;
  knownValueDealCount: number;
  totalValue: number;
}

export interface DealRisk {
  mondayItemId: string;
  name: string;
  normalizedClientKey: Nullable<string>;
  value: Nullable<number>;
  stage: Nullable<string>;
  status: Nullable<string>;
  tentativeCloseDate: Nullable<string>;
  reasons: string[];
}

export interface DealConcentration {
  knownOpenPipelineValue: number;
  topClientValue: number;
  topClientShare: Nullable<number>;
  topFiveClientValue: number;
  topFiveClientShare: Nullable<number>;
}

export interface WorkOrderHealth {
  totalWorkOrders: number;
  activeWorkOrders: number;
  completedWorkOrders: number;
  ongoingWorkOrders: number;
  notStartedWorkOrders: number;
  pausedWorkOrders: number;
  delayedWorkOrders: number;
  arPriorityWorkOrders: number;
  totalAmountInclGst: number;
  billedValueInclGst: number;
  amountToBeBilledInclGst: number;
  collectedAmountInclGst: number;
  receivables: number;
  unknownAmountCount: number;
  unknownReceivableCount: number;
  executionStatusDistribution: Record<string, number>;
  invoiceStatusDistribution: Record<string, number>;
  billingStatusDistribution: Record<string, number>;
}

export interface ClientIntelligence {
  normalizedClientKey: string;
  dealCount: number;
  openDealCount: number;
  openDealValue: number;
  workOrderCount: number;
  activeWorkOrderCount: number;
  workOrderValueInclGst: number;
  receivables: number;
  sectors: string[];
  hasCommercialOpportunity: boolean;
  hasOperationalRisk: boolean;
  hasCombinedCommercialOperationalRisk: boolean;
  operationalRiskReasons: string[];
}

export interface CrossBoardClientSummary {
  totalUniqueWorkOrderClientKeys: number;
  matchedUniqueWorkOrderClientKeys: number;
  unmatchedUniqueWorkOrderClientKeys: number;
  unmatchedWorkOrderClientKeys: string[];
  matchedClients: ClientIntelligence[];
}

export interface LeadershipBriefData {
  pipeline: PipelineMetrics;
  workOrders: WorkOrderHealth;
  topOpenDeals: Deal[];
  riskyDeals: DealRisk[];
  clientsWithCommercialAndOperationalExposure: ClientIntelligence[];
  sectorMetrics: SectorMetrics[];
  dataQuality: DataQualityReport;
}

export interface ClarificationRequest {
  required: true;
  question: string;
  reason: string;
  options?: string[];
}

/** Model prose is advisory only. Numeric truth always remains in AgentResponse.data. */
export interface ExecutiveExplanation {
  headline: string;
  executiveSummary: string;
  observations: string[];
  risks: string[];
  attentionItems: string[];
  followUpQuestions: string[];
}

/**
 * Stable response envelope for Agent 2/3. The LLM may explain deterministic
 * results, but arithmetic belongs in analytics functions and `data` should be
 * populated from those functions.
 */
export interface AgentResponse<T = unknown> {
  ok: boolean;
  answer: string;
  data?: T;
  caveats: string[];
  clarification?: ClarificationRequest;
  explanation?: ExecutiveExplanation;
  source: {
    provider: "monday.com";
    boardIds: string[];
    fetchedAt: string;
  };
  errorCode?: string;
}
