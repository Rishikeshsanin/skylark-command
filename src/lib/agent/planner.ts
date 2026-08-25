import type { ClarificationRequest } from "@/types";
import { queryPlanSchema, type QueryPlan } from "./schemas";

export interface PlannerDecision {
  plan?: QueryPlan;
  clarification?: ClarificationRequest;
}

const CUSTOMER_CLARIFICATION_OPTIONS = [
  "Highest won value",
  "Largest active pipeline",
  "Best project execution",
  "Combined commercial + operational importance",
];

function clarification(
  question: string,
  reason: string,
  options?: string[],
): PlannerDecision {
  return {
    clarification: {
      required: true,
      question,
      reason,
      options,
    },
  };
}

function inferPeriod(text: string): Pick<QueryPlan, "period" | "quarter"> {
  const explicitQuarter = text.match(/\bq([1-4])\s*(20\d{2})\b/i);
  if (explicitQuarter) {
    return { quarter: `Q${explicitQuarter[1]} ${explicitQuarter[2]}` };
  }

  if (/\b(this|current)\s+quarter\b/i.test(text)) {
    return { period: "current_quarter" };
  }
  if (/\b(this|current)\s+year\b/i.test(text)) {
    return { period: "current_year" };
  }
  if (/\blatest\s+(available\s+)?(period|quarter|data)\b/i.test(text)) {
    return { period: "latest_available" };
  }
  if (/\ball[ -]?time\b/i.test(text)) {
    return { period: "all_time" };
  }

  return {};
}

function inferSector(text: string): string | undefined {
  const prefixed = text.match(
    /\b(?:the|our|in|for)\s+([a-z][a-z0-9&/-]*(?:\s+[a-z0-9&/-]+){0,2})\s+sector\b/i,
  );
  if (prefixed?.[1]) return prefixed[1].trim();

  const singleWord = text.match(/\b([a-z][a-z0-9&/-]*)\s+sector\b/i);
  return singleWord?.[1]?.trim();
}

function makePlan(
  intent: QueryPlan["intent"],
  question: string,
  extras: Partial<Omit<QueryPlan, "intent" | "confidence">> = {},
  confidence = 0.95,
): PlannerDecision {
  const candidate = {
    intent,
    ...inferPeriod(question),
    ...extras,
    confidence,
  };
  const parsed = queryPlanSchema.safeParse(candidate);

  if (!parsed.success) {
    return clarification(
      "Could you restate that business question more specifically?",
      "The request could not be represented safely as a supported query plan.",
    );
  }

  return { plan: parsed.data };
}

export function planFounderQuestion(question: string): PlannerDecision {
  const normalized = question.trim().replace(/\s+/g, " ");
  const lower = normalized.toLowerCase();

  if (!normalized) {
    return clarification(
      "What would you like to know about the business?",
      "A business question is required.",
    );
  }

  if (/\b(best|top)\s+(customers?|clients?)\b/i.test(normalized)) {
    return clarification(
      "What should ‘best customers’ mean for this analysis?",
      "Customer quality can mean different commercial or operational outcomes, so the system will not invent a ranking definition.",
      CUSTOMER_CLARIFICATION_OPTIONS,
    );
  }

  if (lower === "highest won value") {
    return makePlan(
      "client_cross_board",
      normalized,
      { focus: "customer_won_value" },
      1,
    );
  }
  if (lower === "largest active pipeline") {
    return makePlan(
      "client_cross_board",
      normalized,
      { focus: "customer_pipeline" },
      1,
    );
  }
  if (lower === "best project execution") {
    return makePlan(
      "client_cross_board",
      normalized,
      { focus: "customer_execution" },
      1,
    );
  }
  if (lower.includes("combined commercial") && lower.includes("operational")) {
    return makePlan(
      "client_cross_board",
      normalized,
      { focus: "customer_combined" },
      1,
    );
  }

  if (/\b(leadership brief|leadership today|before leadership|executive brief)\b/i.test(normalized)) {
    return makePlan("leadership_brief", normalized);
  }

  if (/\b(data quality|data health|missing data|bad data|malformed data)\b/i.test(normalized)) {
    return makePlan("data_health", normalized);
  }

  if (
    /\b(clients?|customers?)\b/i.test(normalized) &&
    /\b(both|open opportunit|active project|commercial.*operational|operational.*commercial)\b/i.test(normalized)
  ) {
    return makePlan(
      "client_cross_board",
      normalized,
      { focus: "commercial_operational" },
    );
  }

  if (/\b(receivable|receivables|amount due|collections?|accounts receivable)\b/i.test(normalized)) {
    return makePlan("receivables", normalized, { focus: "receivables" });
  }

  if (/\b(billing|invoice|to be billed)\b/i.test(normalized)) {
    return makePlan("receivables", normalized, { focus: "billing" });
  }

  if (/\b(delayed|delay|overdue)\b/i.test(normalized) && /\b(work orders?|projects?|operations?)\b/i.test(normalized)) {
    return makePlan("work_order_health", normalized, { focus: "delayed" });
  }

  if (/\b(work orders?|operations?|execution health|project execution)\b/i.test(normalized)) {
    return makePlan("work_order_health", normalized);
  }

  if (/\b(deals? need attention|deal risks?|risky deals?|prioriti[sz]e deals?|stuck deals?)\b/i.test(normalized)) {
    return makePlan("deal_prioritization", normalized, { focus: "attention" });
  }

  if (/\b(how much.*won|won value|won revenue|revenue.*won|closed won)\b/i.test(normalized)) {
    return makePlan("won_value", normalized);
  }

  const sector = inferSector(normalized);
  if (sector) {
    return makePlan("pipeline_by_sector", normalized, { sector });
  }

  if (/\b(pipeline by stage|stage breakdown|deal stages?)\b/i.test(normalized)) {
    return makePlan("pipeline_by_stage", normalized);
  }

  if (/\bpipeline\b/i.test(normalized)) {
    return makePlan("pipeline_overview", normalized);
  }

  if (/\bquarter\b/i.test(normalized) || /\bq[1-4]\s*20\d{2}\b/i.test(normalized)) {
    return makePlan("quarter_analysis", normalized);
  }

  if (/\b(business overview|company overview|how are we doing|overall business)\b/i.test(normalized)) {
    return makePlan("general_overview", normalized, {}, 0.9);
  }

  return clarification(
    "Which business view should I use for that question?",
    "The request does not map confidently to a supported deterministic analytics intent.",
    [
      "Pipeline overview",
      "Work-order health",
      "Receivables",
      "Data quality",
      "Leadership brief",
    ],
  );
}
