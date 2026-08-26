import { z } from "zod";
import type {
  DimensionId as SemanticDimensionId,
  MetricId as SemanticMetricId,
  TrustResponse,
} from "@/lib/semantic/types";

export const semanticMetricIdSchema = z.enum([
  "open_pipeline_value",
  "known_won_value",
  "receivables",
  "total_work_order_value",
  "billed_value",
  "collected_value",
  "to_be_billed",
  "open_deal_count",
  "won_deal_count",
  "active_work_order_count",
]);
export type MetricId = SemanticMetricId;

export const semanticDimensionIdSchema = z.enum([
  "sector",
  "stage",
  "client",
  "quarter",
  "status",
  "work_order_status",
  "billing_status",
  "collection_status",
]);
export type DimensionId = SemanticDimensionId;

export const contextEntityTypeSchema = z.enum([
  "sector",
  "stage",
  "client",
  "deal",
  "work_order",
]);
export type ContextEntityType = z.infer<typeof contextEntityTypeSchema>;

export const analysisPeriodSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("all_time") }).strict(),
  z.object({ kind: z.literal("current_quarter") }).strict(),
  z.object({ kind: z.literal("previous_quarter") }).strict(),
  z.object({ kind: z.literal("quarter"), value: z.string().regex(/^Q[1-4]\s20\d{2}$/) }).strict(),
]);
export type AnalysisPeriod = z.infer<typeof analysisPeriodSchema>;

export const analysisFilterSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("sector"), operator: z.literal("eq"), value: z.string().trim().min(1).max(80) }).strict(),
  z.object({ field: z.literal("stage"), operator: z.literal("eq"), value: z.string().trim().min(1).max(80) }).strict(),
  z.object({ field: z.literal("client"), operator: z.literal("eq"), value: z.string().trim().min(1).max(120) }).strict(),
  z.object({ field: z.literal("deal_value"), operator: z.literal("gte"), value: z.number().finite().nonnegative() }).strict(),
  z.object({ field: z.literal("deal_ids"), operator: z.literal("in"), value: z.array(z.string().trim().min(1)).min(1).max(50) }).strict(),
  z.object({ field: z.literal("work_order_ids"), operator: z.literal("in"), value: z.array(z.string().trim().min(1)).min(1).max(50) }).strict(),
]);
export type AnalysisFilter = z.infer<typeof analysisFilterSchema>;

const isoDateSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);

export const scenarioOverrideSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move_deal_close_period"), dealId: z.string().min(1), quarter: z.string().regex(/^Q[1-4]\s20\d{2}$/) }).strict(),
  z.object({ type: z.literal("move_deal_close_date"), dealId: z.string().min(1), date: isoDateSchema }).strict(),
  z.object({ type: z.literal("set_deal_included"), dealId: z.string().min(1), included: z.boolean() }).strict(),
  z.object({ type: z.literal("set_deal_outcome"), dealId: z.string().min(1), outcome: z.enum(["won", "lost", "open"]) }).strict(),
  z.object({ type: z.literal("set_collection_amount"), workOrderId: z.string().min(1), amount: z.number().finite().nonnegative() }).strict(),
  z.object({ type: z.literal("apply_receivable_payment"), workOrderId: z.string().min(1), amount: z.number().finite().positive() }).strict(),
  z.object({ type: z.literal("delay_work_order"), workOrderId: z.string().min(1), newProbableEndDate: isoDateSchema }).strict(),
  z.object({ type: z.literal("resolve_work_order"), workOrderId: z.string().min(1) }).strict(),
]);
export type ScenarioOverride = z.infer<typeof scenarioOverrideSchema>;

const commonPipelineArgs = {
  sector: z.string().trim().min(1).max(80).optional(),
  stage: z.string().trim().min(1).max(80).optional(),
  minDealValue: z.number().finite().nonnegative().optional(),
  period: analysisPeriodSchema.optional(),
};

export const baseToolCallSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("getPipelineSummary"), args: z.object(commonPipelineArgs).strict() }).strict(),
  z.object({ tool: z.literal("getPipelineBySector"), args: z.object({ ...commonPipelineArgs, stage: z.never().optional() }).strict() }).strict(),
  z.object({ tool: z.literal("getPipelineByStage"), args: z.object({ ...commonPipelineArgs, sector: z.never().optional() }).strict() }).strict(),
  z.object({ tool: z.literal("getCustomer360"), args: z.object({ customerKey: z.string().trim().min(1).max(120) }).strict() }).strict(),
  z.object({ tool: z.literal("getReceivables"), args: z.object({ customerKey: z.string().trim().min(1).max(120).optional() }).strict() }).strict(),
  z.object({ tool: z.literal("getWorkOrderHealth"), args: z.object({ customerKey: z.string().trim().min(1).max(120).optional() }).strict() }).strict(),
  z.object({
    tool: z.literal("getPeriodComparison"),
    args: z.object({
      metricId: z.enum(["open_pipeline_value", "known_won_value", "open_deal_count"]),
      dimension: z.enum(["sector", "stage"]).optional(),
      entity: z.string().trim().min(1).max(120).optional(),
      filters: z.array(analysisFilterSchema).max(8).default([]),
      from: analysisPeriodSchema,
      to: analysisPeriodSchema,
    }).strict(),
  }).strict(),
]);
export type BaseToolCall = z.infer<typeof baseToolCallSchema>;

export const toolCallSchema = z.union([
  baseToolCallSchema,
  z.object({
    tool: z.literal("runScenario"),
    args: z.object({
      analysis: baseToolCallSchema,
      overrides: z.array(scenarioOverrideSchema).min(1).max(20),
    }).strict(),
  }).strict(),
]);
export type ToolCall = z.infer<typeof toolCallSchema>;
export type ToolId = ToolCall["tool"];

export const conversationContextSchema = z.object({
  version: z.literal(1),
  metricId: semanticMetricIdSchema.optional(),
  dimension: semanticDimensionIdSchema.optional(),
  entity: z.object({ type: contextEntityTypeSchema, id: z.string().min(1).max(120), label: z.string().max(160).optional() }).strict().optional(),
  period: analysisPeriodSchema.optional(),
  filters: z.array(analysisFilterSchema).max(8).default([]),
  previousResult: z.object({
    toolCall: toolCallSchema,
    snapshotId: z.string().min(1).max(240),
    semanticMetricIds: z.array(semanticMetricIdSchema).max(10),
    resultRef: z.string().min(1).max(240),
  }).strict().optional(),
}).strict();
export type ConversationContext = z.infer<typeof conversationContextSchema>;

export const plannerProposalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tool_call"), call: toolCallSchema, confidence: z.number().min(0).max(1) }).strict(),
  z.object({ kind: z.literal("clarification"), question: z.string().trim().min(1).max(240), reason: z.string().trim().min(1).max(360), options: z.array(z.string().trim().min(1).max(120)).max(6).optional() }).strict(),
  z.object({ kind: z.literal("unsupported"), reason: z.string().trim().min(1).max(360) }).strict(),
]);
export type PlannerProposal = z.infer<typeof plannerProposalSchema>;

export interface ToolEvidence {
  dealItemIds: string[];
  workOrderItemIds: string[];
  dealCount: number;
  workOrderCount: number;
}

export interface SourceSnapshotTrace {
  id: string;
  provider: "monday.com";
  boardIds: string[];
  fetchedAt: string;
}

export interface AnalysisTrustTrace {
  planner: "gemini" | "deterministic_fallback";
  toolsUsed: ToolId[];
  semanticMetricIds: MetricId[];
  filters: AnalysisFilter[];
  sourceSnapshot: SourceSnapshotTrace | null;
  evidence: ToolEvidence;
  semanticTrust?: TrustResponse;
  scenarioTrust?: { baseline: TrustResponse; scenario: TrustResponse };
  context: ConversationContext;
  caveats: string[];
}
