import type {
  EvidenceQuality,
  EvidenceQualityClass,
  EvidenceQualityFactor,
  EvidenceQualityInput,
} from "./types";

export const EVIDENCE_QUALITY_POLICY_VERSION = "1.0.0" as const;

const STATUS_RANK: Record<EvidenceQualityClass, number> = {
  Strong: 0,
  Moderate: 1,
  Limited: 2,
};

const STRONG_VALUE_COVERAGE = 0.95;
const MODERATE_VALUE_COVERAGE = 0.75;
const STRONG_JOIN_COVERAGE = 0.98;
const MODERATE_JOIN_COVERAGE = 0.9;
const STRONG_FRESHNESS_MINUTES = 60;
const MODERATE_FRESHNESS_MINUTES = 24 * 60;

function worstStatus(factors: EvidenceQualityFactor[]): EvidenceQualityClass {
  return factors.reduce<EvidenceQualityClass>(
    (worst, factor) => STATUS_RANK[factor.status] > STATUS_RANK[worst] ? factor.status : worst,
    "Strong",
  );
}

function completenessFactor(input: EvidenceQualityInput): EvidenceQualityFactor {
  const tracked = input.lineage.metricRecords.filter(
    (metric) => metric.knownValueCount !== null && metric.unknownValueCount !== null,
  );
  if (tracked.length === 0) {
    return {
      id: "completeness",
      status: "Strong",
      reason: "No value-completeness-sensitive metric is present in this answer.",
    };
  }

  let known = 0;
  let unknown = 0;
  for (const metric of tracked) {
    known += metric.knownValueCount ?? 0;
    unknown += metric.unknownValueCount ?? 0;
  }
  const total = known + unknown;
  if (total === 0) {
    return {
      id: "completeness",
      status: "Limited",
      reason: "No eligible records were available to establish known-value coverage for the requested monetary metric.",
    };
  }

  const ratio = known / total;
  if (ratio >= STRONG_VALUE_COVERAGE) {
    return {
      id: "completeness",
      status: "Strong",
      reason: `${known} of ${total} eligible value records are known (at least 95% coverage).`,
    };
  }
  if (ratio >= MODERATE_VALUE_COVERAGE) {
    return {
      id: "completeness",
      status: "Moderate",
      reason: `${known} of ${total} eligible value records are known (between 75% and 95% coverage).`,
    };
  }
  return {
    id: "completeness",
    status: "Limited",
    reason: `${known} of ${total} eligible value records are known (below 75% coverage).`,
  };
}

function freshnessFactor(input: EvidenceQualityInput): EvidenceQualityFactor {
  const fetched = Date.parse(input.lineage.sourceSnapshot.fetchedAt);
  const analyzed = Date.parse(input.lineage.analysisTimestamp);
  if (!Number.isFinite(fetched) || !Number.isFinite(analyzed) || analyzed < fetched) {
    return {
      id: "freshness",
      status: "Limited",
      reason: "Source freshness cannot be verified from the supplied snapshot and analysis timestamps.",
    };
  }

  const ageMinutes = Math.floor((analyzed - fetched) / 60_000);
  if (ageMinutes <= STRONG_FRESHNESS_MINUTES) {
    return {
      id: "freshness",
      status: "Strong",
      reason: `Source snapshot is ${ageMinutes} minute(s) old (within the 60-minute strong-freshness policy).`,
    };
  }
  if (ageMinutes <= MODERATE_FRESHNESS_MINUTES) {
    return {
      id: "freshness",
      status: "Moderate",
      reason: `Source snapshot is ${ageMinutes} minute(s) old (older than 60 minutes but within 24 hours).`,
    };
  }
  return {
    id: "freshness",
    status: "Limited",
    reason: `Source snapshot is ${ageMinutes} minute(s) old (older than the 24-hour freshness policy).`,
  };
}

function joinCoverageFactor(input: EvidenceQualityInput): EvidenceQualityFactor {
  if (input.lineage.joinPath.length === 0) {
    return {
      id: "join_coverage",
      status: "Strong",
      reason: "This answer does not depend on a cross-entity business join.",
    };
  }

  const total = input.lineage.joinPath.reduce((sum, join) => sum + join.totalKeys, 0);
  const matched = input.lineage.joinPath.reduce((sum, join) => sum + join.matchedKeys, 0);
  if (total === 0) {
    return {
      id: "join_coverage",
      status: "Limited",
      reason: "The requested join had no eligible normalized keys, so join coverage cannot support a strong result.",
    };
  }
  const ratio = matched / total;
  if (ratio >= STRONG_JOIN_COVERAGE) {
    return {
      id: "join_coverage",
      status: "Strong",
      reason: `${matched} of ${total} eligible normalized keys matched exactly (at least 98% join coverage).`,
    };
  }
  if (ratio >= MODERATE_JOIN_COVERAGE) {
    return {
      id: "join_coverage",
      status: "Moderate",
      reason: `${matched} of ${total} eligible normalized keys matched exactly (between 90% and 98% join coverage).`,
    };
  }
  return {
    id: "join_coverage",
    status: "Limited",
    reason: `${matched} of ${total} eligible normalized keys matched exactly (below 90% join coverage).`,
  };
}

function temporalCoverageFactor(input: EvidenceQualityInput): EvidenceQualityFactor {
  const temporal = input.temporalCoverage;
  if (!temporal?.requested) {
    return {
      id: "temporal_coverage",
      status: "Strong",
      reason: "The answer does not claim a historical time range beyond the supplied source snapshot.",
    };
  }
  if (temporal.covered && !temporal.partial) {
    return {
      id: "temporal_coverage",
      status: "Strong",
      reason: temporal.reason ?? "The requested temporal range is fully covered by deterministic source records.",
    };
  }
  if (temporal.covered && temporal.partial) {
    return {
      id: "temporal_coverage",
      status: "Moderate",
      reason: temporal.reason ?? "The requested temporal range is only partially covered by deterministic source records.",
    };
  }
  return {
    id: "temporal_coverage",
    status: "Limited",
    reason: temporal.reason ?? "The requested temporal range is not covered by deterministic source records.",
  };
}

function sourceQualityFactor(input: EvidenceQualityInput): EvidenceQualityFactor {
  const issues = input.sourceQualityIssues ?? { info: 0, warning: 0, error: 0 };
  if (issues.error > 0) {
    return {
      id: "source_quality",
      status: "Limited",
      reason: `${issues.error} source-quality error(s) affect the supplied dataset; warnings: ${issues.warning}, info: ${issues.info}.`,
    };
  }
  if (issues.warning > 0) {
    return {
      id: "source_quality",
      status: "Moderate",
      reason: `${issues.warning} source-quality warning(s) are present; no source-quality errors are reported.`,
    };
  }
  return {
    id: "source_quality",
    status: "Strong",
    reason: `No source-quality errors or warnings are reported; informational issues: ${issues.info}.`,
  };
}

export function assessEvidenceQuality(input: EvidenceQualityInput): EvidenceQuality {
  const factors = [
    completenessFactor(input),
    freshnessFactor(input),
    joinCoverageFactor(input),
    temporalCoverageFactor(input),
    sourceQualityFactor(input),
  ];
  const status = worstStatus(factors);
  return {
    status,
    reasons: factors.filter((factor) => factor.status !== "Strong").map((factor) => factor.reason),
    factors,
    policyVersion: EVIDENCE_QUALITY_POLICY_VERSION,
  };
}
