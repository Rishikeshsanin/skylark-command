import type {
  AgentResponse,
  AnalyticsResult,
  ClarificationRequest,
} from "@/types";
import type { QueryPlan } from "./schemas";

function configuredBoardIds(): string[] {
  return [
    process.env.MONDAY_DEALS_BOARD_ID,
    process.env.MONDAY_WORK_ORDERS_BOARD_ID,
  ].filter((value): value is string => Boolean(value));
}

export function sourceMetadata(
  fetchedAt = new Date().toISOString(),
): AgentResponse["source"] {
  return {
    provider: "monday.com",
    boardIds: configuredBoardIds(),
    fetchedAt,
  };
}

export function buildClarificationResponse(
  clarification: ClarificationRequest,
): AgentResponse<never> {
  return {
    ok: true,
    answer: clarification.question,
    caveats: [
      "No business analytics were executed because clarification is required.",
    ],
    clarification,
    source: sourceMetadata(),
  };
}

const INTENT_LABELS: Record<QueryPlan["intent"], string> = {
  pipeline_overview: "pipeline overview",
  pipeline_by_sector: "pipeline by sector",
  pipeline_by_stage: "pipeline by stage",
  won_value: "won value",
  deal_prioritization: "deal prioritization",
  quarter_analysis: "quarter analysis",
  work_order_health: "work-order health",
  receivables: "receivables",
  client_cross_board: "cross-board client analysis",
  data_health: "data health",
  leadership_brief: "leadership brief",
  general_overview: "general business overview",
  unknown: "unknown analysis",
};

export function composeAnalyticsResponse<T>(
  plan: QueryPlan,
  result: AnalyticsResult<T>,
  source: AgentResponse["source"],
): AgentResponse<T> {
  return {
    ok: true,
    answer: `Deterministic ${INTENT_LABELS[plan.intent]} analytics completed.`,
    data: result.data,
    caveats: result.caveats,
    source,
  };
}

export function buildErrorAgentResponse(
  errorCode: string,
  answer: string,
  caveats: string[] = [],
): AgentResponse<never> {
  return {
    ok: false,
    answer,
    caveats,
    source: sourceMetadata(),
    errorCode,
  };
}
