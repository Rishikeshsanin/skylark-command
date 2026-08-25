import { z } from "zod";
import type {
  AgentResponse,
  AnalyticsResult,
  ExecutiveExplanation,
} from "@/types";
import type { QueryPlan } from "./schemas";

const numericProsePattern = /[0-9]/;

function proseField(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => !numericProsePattern.test(value),
      "Executive prose must not contain numeric characters; metrics are rendered separately.",
    );
}

const listItemSchema = proseField(260);

export const executiveExplanationSchema = z
  .object({
    headline: proseField(140),
    executiveSummary: proseField(900),
    observations: z.array(listItemSchema).max(5),
    risks: z.array(listItemSchema).max(5),
    attentionItems: z.array(listItemSchema).max(5),
    followUpQuestions: z.array(listItemSchema).max(4),
  })
  .strict();

/** JSON schema sent to Gemini. Zod validation remains the final trust boundary. */
export const executiveExplanationJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: {
      type: "string",
      description: "Concise executive headline. Do not include digits or restate metric values.",
    },
    executiveSummary: {
      type: "string",
      description: "Concise executive explanation grounded only in deterministic facts. Do not include digits, dates, percentages, counts, or currency values.",
    },
    observations: {
      type: "array",
      maxItems: 5,
      items: {
        type: "string",
        description: "Qualitative observation supported by deterministic data. No digits or metric restatement.",
      },
    },
    risks: {
      type: "array",
      maxItems: 5,
      items: {
        type: "string",
        description: "Supported risk or caveat. No digits or invented prediction.",
      },
    },
    attentionItems: {
      type: "array",
      maxItems: 5,
      items: {
        type: "string",
        description: "Actionable attention item grounded in supplied facts. No digits.",
      },
    },
    followUpQuestions: {
      type: "array",
      maxItems: 4,
      items: {
        type: "string",
        description: "Useful supported follow-up question. No digits.",
      },
    },
  },
  required: [
    "headline",
    "executiveSummary",
    "observations",
    "risks",
    "attentionItems",
    "followUpQuestions",
  ],
} as const;

export interface ExecutiveExplanationInput {
  founderQuestion: string;
  plan: QueryPlan;
  result: AnalyticsResult<unknown>;
  source: AgentResponse["source"];
}

export interface ExecutiveExplanationProvider {
  readonly name: string;
  readonly model: string;
  explain(input: ExecutiveExplanationInput): Promise<ExecutiveExplanation>;
}

const INTENT_HEADLINES: Record<QueryPlan["intent"], string> = {
  pipeline_overview: "Pipeline view ready",
  pipeline_by_sector: "Sector pipeline view ready",
  pipeline_by_stage: "Stage pipeline view ready",
  won_value: "Won value view ready",
  deal_prioritization: "Deal attention view ready",
  quarter_analysis: "Quarter view ready",
  work_order_health: "Operations health view ready",
  receivables: "Receivables view ready",
  client_cross_board: "Client intelligence view ready",
  data_health: "Data health view ready",
  leadership_brief: "Leadership brief ready",
  general_overview: "Business overview ready",
  unknown: "Business view unavailable",
};

export function buildDeterministicFallbackExplanation(
  plan: QueryPlan,
  result: AnalyticsResult<unknown>,
): ExecutiveExplanation {
  const hasCaveats = result.caveats.length > 0;
  return {
    headline: INTENT_HEADLINES[plan.intent],
    executiveSummary:
      "Authoritative metrics are available from deterministic analytics. The external explanation layer was unavailable, so no generated interpretation was used.",
    observations: [
      "Use the structured analytics payload as the exclusive source of business truth.",
    ],
    risks: hasCaveats
      ? ["Review the authoritative data caveats before drawing conclusions."]
      : [],
    attentionItems: hasCaveats
      ? ["Resolve or account for the supplied data limitations before acting on the analysis."]
      : [],
    followUpQuestions: ["Would you like a narrower supported business view?"],
  };
}
