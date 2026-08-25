import { z } from "zod";

export const MAX_MESSAGE_CHARS = 2_000;
export const MAX_REQUEST_BYTES = 8_192;
export const MAX_MODEL_OUTPUT_CHARS = 4_096;

export const chatRequestSchema = z
  .object({
    message: z
      .string()
      .trim()
      .min(1, "Message is required")
      .max(MAX_MESSAGE_CHARS, "Message is too long"),
  })
  .strict();

export const queryIntentSchema = z.enum([
  "pipeline_overview",
  "pipeline_by_sector",
  "pipeline_by_stage",
  "won_value",
  "deal_prioritization",
  "quarter_analysis",
  "work_order_health",
  "receivables",
  "client_cross_board",
  "data_health",
  "leadership_brief",
  "general_overview",
  "unknown",
]);

export const queryPeriodSchema = z.enum([
  "current_quarter",
  "current_year",
  "latest_available",
  "all_time",
]);

export const queryFocusSchema = z.enum([
  "delayed",
  "attention",
  "billing",
  "receivables",
  "commercial_operational",
  "cross_board_presence",
  "sector_open_pipeline",
  "customer_won_value",
  "customer_pipeline",
  "customer_execution",
  "customer_combined",
]);

export const queryPlanSchema = z
  .object({
    intent: queryIntentSchema,
    sector: z.string().trim().min(1).max(80).optional(),
    stage: z.string().trim().min(1).max(80).optional(),
    period: queryPeriodSchema.optional(),
    quarter: z.string().regex(/^Q[1-4]\s20\d{2}$/).optional(),
    focus: queryFocusSchema.optional(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type QueryPlan = z.infer<typeof queryPlanSchema>;
