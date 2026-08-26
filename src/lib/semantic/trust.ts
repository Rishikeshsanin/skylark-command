import { getJoinDefinition } from "./joins";
import { getMetricDefinition } from "./registry";
import type { AnswerLineage, EvidenceQuality, TrustResponse } from "./types";

export const DETERMINISTIC_TRUST_BOUNDARY =
  "Metric values are produced only by canonical deterministic analytics. The semantic layer supplies definitions, filters, lineage, coverage, freshness, and join evidence; it does not calculate business metrics or rely on LLM prose.";

export function buildTrustResponse(
  lineage: AnswerLineage,
  evidenceQuality: EvidenceQuality,
): TrustResponse {
  const limitations: string[] = [];

  for (const metric of lineage.metricRecords) {
    if ((metric.unknownValueCount ?? 0) > 0) {
      limitations.push(
        `${getMetricDefinition(metric.metricId).label} excludes ${metric.unknownValueCount} unknown-value record(s) from its monetary aggregation.`,
      );
    }
  }
  for (const join of lineage.joinPath) {
    if (join.unmatchedKeys > 0) {
      limitations.push(
        `${join.unmatchedKeys} of ${join.totalKeys} eligible normalized join key(s) are unmatched by the exact client join.`,
      );
    }
  }
  if (evidenceQuality.reasons.length > 0) {
    limitations.push(...evidenceQuality.reasons);
  }

  return {
    kind: "semantic_trust",
    question: "Why should I trust this result?",
    evidenceQuality,
    metrics: lineage.metricIds.map(getMetricDefinition),
    lineage,
    joins: lineage.joinPath.map((join) => getJoinDefinition(join.joinId)),
    deterministicBoundary: DETERMINISTIC_TRUST_BOUNDARY,
    limitations: [...new Set(limitations)],
  };
}
