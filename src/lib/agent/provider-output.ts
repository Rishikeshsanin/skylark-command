import {
  MAX_MODEL_OUTPUT_CHARS,
  queryPlanSchema,
  type QueryPlan,
} from "./schemas";

/**
 * Parses a future bounded LLM planner response. Unknown keys, prose wrappers,
 * arithmetic fields, or malformed JSON are rejected rather than guessed.
 */
export function parsePlannerModelOutput(raw: string): QueryPlan | null {
  if (!raw || raw.length > MAX_MODEL_OUTPUT_CHARS) return null;

  try {
    const parsedJson: unknown = JSON.parse(raw);
    const parsedPlan = queryPlanSchema.safeParse(parsedJson);
    return parsedPlan.success ? parsedPlan.data : null;
  } catch {
    return null;
  }
}
