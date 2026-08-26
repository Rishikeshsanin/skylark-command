import type { Deal } from "@/types";
import { normalizeClientCode } from "@/lib/normalization/client-code";
import { normalizeLabel, roundAmount } from "./helpers";
import { getDealPeriodDate, quarterForDate } from "./periods";

export type CustomerContributionMetricId =
  | "open_pipeline_value"
  | "known_won_value";

export interface CustomerContributionScope {
  metricId?: CustomerContributionMetricId;
  status?: "Open" | "Won";
  sector?: string;
  stage?: string;
  customerKey?: string;
  minDealValue?: number;
  maxDealValue?: number;
  period?: string | null;
  dealIds?: string[];
}

export interface CustomerContributionExcludedRecord {
  mondayItemId: string;
  reasons: string[];
}

export interface CustomerContributionRow {
  rank: number | null;
  normalizedClientKey: string;
  displayLabel: string;
  displayLabelSource: "normalized_client_key";
  dealCount: number;
  knownDealCount: number;
  unknownDealCount: number;
  knownValueContribution: number | null;
  shareOfKnownFilteredValue: number | null;
  sourceRecordIds: string[];
  evidenceIds: string[];
  followUp: {
    customerKey: string;
    supportedActions: [
      "customer_360",
      "work_orders",
      "receivables",
      "compare_customer_contributions",
    ];
  };
}

export interface CustomerContributionCoverage {
  sourceDealCount: number;
  malformedExcludedDealCount: number;
  scopedDealCount: number;
  knownValueDealCount: number;
  unknownValueDealCount: number;
  knownFilteredValue: number | null;
  attributedDealCount: number;
  unattributedDealCount: number;
  attributedKnownValueDealCount: number;
  unattributedKnownValueDealCount: number;
  knownAttributedValue: number | null;
  knownUnattributedValue: number | null;
  valueThresholdUnknownDealCount: number;
}

export interface CustomerContributionResult {
  kind: "customer_contribution";
  metricId: CustomerContributionMetricId;
  scope: Required<Pick<CustomerContributionScope, "status">> &
    Omit<CustomerContributionScope, "status" | "metricId"> & {
      metricId: CustomerContributionMetricId;
      customerKey?: string;
      dealIds?: string[];
    };
  customers: CustomerContributionRow[];
  coverage: CustomerContributionCoverage;
  recordsIncluded: string[];
  recordsExcluded: CustomerContributionExcludedRecord[];
  evidenceIds: string[];
  customerIdentity: {
    dimensionId: "client";
    canonicalField: "normalizedClientKey";
    matchType: "exact";
    fuzzyMatchingAllowed: false;
    semantics: string;
  };
  caveats: string[];
}

function metricForStatus(status: "Open" | "Won"): CustomerContributionMetricId {
  return status === "Won" ? "known_won_value" : "open_pipeline_value";
}

function statusForMetric(metricId: CustomerContributionMetricId): "Open" | "Won" {
  return metricId === "known_won_value" ? "Won" : "Open";
}

function normalizeScope(scope: CustomerContributionScope): CustomerContributionResult["scope"] {
  const metricId = scope.metricId ?? metricForStatus(scope.status ?? "Open");
  const status = scope.status ?? statusForMetric(metricId);
  if (metricForStatus(status) !== metricId) {
    throw new Error(`Customer contribution status ${status} conflicts with semantic metric ${metricId}.`);
  }
  if (scope.minDealValue !== undefined && (!Number.isFinite(scope.minDealValue) || scope.minDealValue < 0)) {
    throw new Error("Minimum Deal value must be a finite non-negative number.");
  }
  if (scope.maxDealValue !== undefined && (!Number.isFinite(scope.maxDealValue) || scope.maxDealValue < 0)) {
    throw new Error("Maximum Deal value must be a finite non-negative number.");
  }
  if (
    scope.minDealValue !== undefined &&
    scope.maxDealValue !== undefined &&
    scope.minDealValue > scope.maxDealValue
  ) {
    throw new Error("Minimum Deal value cannot exceed maximum Deal value.");
  }
  if (scope.period && !/^Q[1-4]\s20\d{2}$/.test(scope.period)) {
    throw new Error("Customer contribution period must use canonical quarter format Q1-Q4 YYYY.");
  }

  const customerKey = scope.customerKey === undefined
    ? undefined
    : normalizeClientCode(scope.customerKey);
  if (scope.customerKey !== undefined && !customerKey) {
    throw new Error("Customer key could not be normalized.");
  }

  return {
    metricId,
    status,
    ...(scope.sector ? { sector: scope.sector.trim() } : {}),
    ...(scope.stage ? { stage: scope.stage.trim() } : {}),
    ...(customerKey ? { customerKey } : {}),
    ...(scope.minDealValue !== undefined ? { minDealValue: scope.minDealValue } : {}),
    ...(scope.maxDealValue !== undefined ? { maxDealValue: scope.maxDealValue } : {}),
    ...(scope.period ? { period: scope.period } : {}),
    ...(scope.dealIds ? { dealIds: [...new Set(scope.dealIds)].sort() } : {}),
  };
}

function knownSum(values: number[]): number | null {
  return values.length > 0 ? roundAmount(values.reduce((sum, value) => sum + value, 0)) : null;
}

function exactTextMatch(actual: string | null | undefined, expected: string): boolean {
  return normalizeLabel(actual) === normalizeLabel(expected);
}

export function calculateCustomerContribution(
  deals: Deal[],
  rawScope: CustomerContributionScope = {},
): CustomerContributionResult {
  const scope = normalizeScope(rawScope);
  const allowedIds = scope.dealIds ? new Set(scope.dealIds) : null;
  const included: Deal[] = [];
  const excluded: CustomerContributionExcludedRecord[] = [];
  let malformedExcludedDealCount = 0;
  let valueThresholdUnknownDealCount = 0;

  for (const deal of deals) {
    const reasons: string[] = [];
    if (deal.malformed) {
      malformedExcludedDealCount += 1;
      reasons.push("malformed source record");
    } else {
      if (!exactTextMatch(deal.status, scope.status)) {
        reasons.push(`outside ${scope.metricId} canonical ${scope.status} Deal population`);
      }
      if (scope.sector && !exactTextMatch(deal.sector, scope.sector)) {
        reasons.push("excluded by sector filter");
      }
      if (scope.stage && !exactTextMatch(deal.stage, scope.stage)) {
        reasons.push("excluded by stage filter");
      }
      if (scope.customerKey && deal.normalizedClientKey !== scope.customerKey) {
        reasons.push("excluded by exact normalized customer filter");
      }
      if (scope.period) {
        const periodDate = getDealPeriodDate(deal);
        if (!periodDate || quarterForDate(periodDate) !== scope.period) {
          reasons.push("excluded by quarter filter");
        }
      }
      if (allowedIds && !allowedIds.has(deal.mondayItemId)) {
        reasons.push("excluded by grounded Deal ID scope");
      }
      if (scope.minDealValue !== undefined || scope.maxDealValue !== undefined) {
        if (deal.value === null) {
          valueThresholdUnknownDealCount += 1;
          reasons.push("unknown Deal value cannot satisfy explicit value threshold");
        } else {
          if (scope.minDealValue !== undefined && deal.value < scope.minDealValue) {
            reasons.push("excluded by minimum Deal value filter");
          }
          if (scope.maxDealValue !== undefined && deal.value > scope.maxDealValue) {
            reasons.push("excluded by maximum Deal value filter");
          }
        }
      }
    }

    if (reasons.length === 0) included.push(deal);
    else excluded.push({ mondayItemId: deal.mondayItemId, reasons: [...new Set(reasons)] });
  }

  const knownIncluded = included.filter((deal) => deal.value !== null);
  const unknownIncluded = included.filter((deal) => deal.value === null);
  const knownFilteredValue = knownSum(knownIncluded.map((deal) => deal.value as number));
  const attributed = included.filter((deal) => deal.normalizedClientKey !== null);
  const unattributed = included.filter((deal) => deal.normalizedClientKey === null);
  const attributedKnown = attributed.filter((deal) => deal.value !== null);
  const unattributedKnown = unattributed.filter((deal) => deal.value !== null);

  const groups = new Map<string, Deal[]>();
  for (const deal of attributed) {
    const key = deal.normalizedClientKey as string;
    groups.set(key, [...(groups.get(key) ?? []), deal]);
  }

  const rows: CustomerContributionRow[] = [...groups.entries()].map(([key, customerDeals]) => {
    const knownDeals = customerDeals.filter((deal) => deal.value !== null);
    const unknownDeals = customerDeals.filter((deal) => deal.value === null);
    const contribution = knownSum(knownDeals.map((deal) => deal.value as number));
    const sourceRecordIds = customerDeals.map((deal) => deal.mondayItemId).sort();
    return {
      rank: null,
      normalizedClientKey: key,
      displayLabel: key,
      displayLabelSource: "normalized_client_key",
      dealCount: customerDeals.length,
      knownDealCount: knownDeals.length,
      unknownDealCount: unknownDeals.length,
      knownValueContribution: contribution,
      shareOfKnownFilteredValue:
        contribution !== null && knownFilteredValue !== null && knownFilteredValue !== 0
          ? roundAmount(contribution / knownFilteredValue)
          : null,
      sourceRecordIds,
      evidenceIds: [...sourceRecordIds],
      followUp: {
        customerKey: key,
        supportedActions: [
          "customer_360",
          "work_orders",
          "receivables",
          "compare_customer_contributions",
        ],
      },
    };
  });

  rows.sort((a, b) => {
    const aKnown = a.knownValueContribution !== null;
    const bKnown = b.knownValueContribution !== null;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if (aKnown && bKnown) {
      const amountDelta = (b.knownValueContribution as number) - (a.knownValueContribution as number);
      if (amountDelta !== 0) return amountDelta;
    }
    return b.dealCount - a.dealCount || a.normalizedClientKey.localeCompare(b.normalizedClientKey);
  });

  let knownPosition = 0;
  let previousKnownValue: number | null = null;
  let previousRank = 0;
  for (const row of rows) {
    if (row.knownValueContribution === null) continue;
    knownPosition += 1;
    if (previousKnownValue === null || row.knownValueContribution !== previousKnownValue) {
      previousRank = knownPosition;
      previousKnownValue = row.knownValueContribution;
    }
    row.rank = previousRank;
  }

  const caveats: string[] = [
    "Customer identity uses exact canonical normalizedClientKey equality only; no fuzzy matching or invented customer names are used.",
  ];
  if (unknownIncluded.length > 0) {
    caveats.push(`${unknownIncluded.length} scoped Deal record(s) have unknown monetary value and are retained in customer coverage but excluded from known-value contribution.`);
  }
  if (valueThresholdUnknownDealCount > 0) {
    caveats.push(`${valueThresholdUnknownDealCount} Deal record(s) had unknown monetary value and could not be proven to satisfy the explicit value threshold.`);
  }
  if (unattributed.length > 0) {
    caveats.push(`${unattributed.length} scoped Deal record(s) have no normalized customer key and are not assigned to any customer.`);
  }
  if (knownFilteredValue === null) {
    caveats.push("The grounded scope contains no known monetary Deal values, so customer monetary ranking and share are not reported.");
  } else if (knownFilteredValue === 0) {
    caveats.push("The grounded scope has known monetary records whose total is zero; contribution shares are undefined and are not reported.");
  }
  if (included.length === 0) {
    caveats.push("No Deal records matched the grounded deterministic scope.");
  }

  const recordsIncluded = included.map((deal) => deal.mondayItemId).sort();
  return {
    kind: "customer_contribution",
    metricId: scope.metricId,
    scope,
    customers: rows,
    coverage: {
      sourceDealCount: deals.length,
      malformedExcludedDealCount,
      scopedDealCount: included.length,
      knownValueDealCount: knownIncluded.length,
      unknownValueDealCount: unknownIncluded.length,
      knownFilteredValue,
      attributedDealCount: attributed.length,
      unattributedDealCount: unattributed.length,
      attributedKnownValueDealCount: attributedKnown.length,
      unattributedKnownValueDealCount: unattributedKnown.length,
      knownAttributedValue: knownSum(attributedKnown.map((deal) => deal.value as number)),
      knownUnattributedValue: knownSum(unattributedKnown.map((deal) => deal.value as number)),
      valueThresholdUnknownDealCount,
    },
    recordsIncluded,
    recordsExcluded: excluded.sort((a, b) => a.mondayItemId.localeCompare(b.mondayItemId)),
    evidenceIds: [...recordsIncluded],
    customerIdentity: {
      dimensionId: "client",
      canonicalField: "normalizedClientKey",
      matchType: "exact",
      fuzzyMatchingAllowed: false,
      semantics: "Known COMPANY/WOCOMPANY variants are normalized by the existing canonical normalizer; grouping then uses exact normalizedClientKey equality only.",
    },
    caveats,
  };
}
