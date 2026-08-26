import type { JoinDefinition } from "./types";

export const CLIENT_EXACT_JOIN_ID = "deal_to_work_order_by_normalized_client";

export const SEMANTIC_JOINS: Record<string, JoinDefinition> = {
  [CLIENT_EXACT_JOIN_ID]: {
    id: CLIENT_EXACT_JOIN_ID,
    label: "Deals to Work Orders by normalized client",
    leftEntity: "deal",
    rightEntity: "work_order",
    leftKey: "normalizedClientKey",
    rightKey: "normalizedClientKey",
    matchType: "exact",
    cardinality: "many_to_many",
    normalization:
      "Known COMPANY code variants are normalized by normalizeClientCode (for example WOCOMPANY_002 and COMPANY_002 become COMPANY002). Unknown formats are only trimmed, upper-cased, and whitespace-compacted; they are not guessed.",
    unmatchedSemantics:
      "A normalized key present on one board and absent on the other remains unmatched. No fuzzy name, edit-distance, embedding, or LLM-assisted business join is permitted.",
    fuzzyMatchingAllowed: false,
    semanticVersion: "1.0.0",
  },
};

export function getJoinDefinition(id: string): JoinDefinition {
  const definition = SEMANTIC_JOINS[id];
  if (!definition) throw new Error(`Unknown semantic join: ${id}`);
  return definition;
}

export function listJoinDefinitions(): JoinDefinition[] {
  return Object.values(SEMANTIC_JOINS);
}
