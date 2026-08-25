import type { DimensionDefinition, DimensionId, MetricId } from "./types";
import { getMetricDefinition } from "./registry";

const V1 = "1.0.0" as const;

export const SEMANTIC_DIMENSIONS: Record<DimensionId, DimensionDefinition> = {
  sector: {
    id: "sector",
    label: "Sector",
    description: "Normalized business sector label from Deals or Work Orders; blank values are represented by analytics as Unknown where applicable.",
    sourceEntities: ["deal", "work_order"],
    canonicalFields: { deal: "sector", work_order: "sector" },
    semanticVersion: V1,
  },
  stage: {
    id: "stage",
    label: "Deal stage",
    description: "Current normalized Deal stage.",
    sourceEntities: ["deal"],
    canonicalFields: { deal: "stage" },
    semanticVersion: V1,
  },
  client: {
    id: "client",
    label: "Client",
    description: "Exact normalized client key used for grouping and cross-board joins.",
    sourceEntities: ["deal", "work_order"],
    canonicalFields: {
      deal: "normalizedClientKey",
      work_order: "normalizedClientKey",
    },
    semanticVersion: V1,
  },
  quarter: {
    id: "quarter",
    label: "Quarter",
    description: "Calendar quarter derived by canonical period analytics from Deal closeDate, falling back to tentativeCloseDate when required by that analysis.",
    sourceEntities: ["deal"],
    canonicalFields: { deal: "closeDate|tentativeCloseDate" },
    semanticVersion: V1,
  },
  status: {
    id: "status",
    label: "Deal status",
    description: "Current normalized Deal status used by canonical deal classifiers.",
    sourceEntities: ["deal"],
    canonicalFields: { deal: "status" },
    semanticVersion: V1,
  },
  work_order_status: {
    id: "work_order_status",
    label: "Work Order status",
    description: "Current Work Order execution status classified by canonical Work Order status logic.",
    sourceEntities: ["work_order"],
    canonicalFields: { work_order: "executionStatus" },
    semanticVersion: V1,
  },
  billing_status: {
    id: "billing_status",
    label: "Billing status",
    description: "Current normalized Work Order billing status.",
    sourceEntities: ["work_order"],
    canonicalFields: { work_order: "billingStatus" },
    semanticVersion: V1,
  },
  collection_status: {
    id: "collection_status",
    label: "Collection status",
    description: "Current normalized Work Order collection status.",
    sourceEntities: ["work_order"],
    canonicalFields: { work_order: "collectionStatus" },
    semanticVersion: V1,
  },
};

export function getDimensionDefinition(id: DimensionId): DimensionDefinition {
  return SEMANTIC_DIMENSIONS[id];
}

export function validateMetricDimensions(
  metricId: MetricId,
  dimensions: DimensionId[],
): { valid: boolean; invalid: DimensionId[] } {
  const metric = getMetricDefinition(metricId);
  const allowed = new Set(metric.validDimensions);
  const invalid = dimensions.filter((dimension) => !allowed.has(dimension));
  return { valid: invalid.length === 0, invalid };
}

export function assertMetricDimensions(metricId: MetricId, dimensions: DimensionId[]): void {
  const validation = validateMetricDimensions(metricId, dimensions);
  if (!validation.valid) {
    throw new Error(
      `Metric ${metricId} does not support dimension(s): ${validation.invalid.join(", ")}`,
    );
  }
}
