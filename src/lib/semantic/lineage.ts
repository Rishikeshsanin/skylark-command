import type { BusinessDataSnapshot } from "@/lib/business-data";
import {
  classifyWorkOrderStatus,
  isActiveWorkOrder,
  isOpenDeal,
  isWonDeal,
  normalizeLabel,
} from "@/lib/analytics/helpers";
import type { Deal, WorkOrder } from "@/types";
import { getMetricDefinition } from "./registry";
import { CLIENT_EXACT_JOIN_ID } from "./joins";
import type {
  AnswerLineage,
  DimensionId,
  ExcludedRecordReference,
  JoinLineage,
  LineageFilter,
  LineageTimeRange,
  MetricId,
  MetricRecordLineage,
  RecordReference,
  SourceEntity,
} from "./types";

type EntityRecord = Deal | WorkOrder;

interface MetricPopulation {
  entity: SourceEntity;
  records: EntityRecord[];
  eligible: (record: EntityRecord) => boolean;
  value: (record: EntityRecord) => number | null | undefined;
  tracksCoverage: boolean;
}

function dealRecord(record: EntityRecord): record is Deal {
  return "mondayItemId" in record && "clientCode" in record;
}

function workOrderRecord(record: EntityRecord): record is WorkOrder {
  return "mondayItemId" in record && "customerCode" in record;
}

function metricPopulation(metricId: MetricId, snapshot: BusinessDataSnapshot): MetricPopulation {
  switch (metricId) {
    case "open_pipeline_value":
      return {
        entity: "deal",
        records: snapshot.deals,
        eligible: (record) => dealRecord(record) && !record.malformed && isOpenDeal(record),
        value: (record) => (dealRecord(record) ? record.value : null),
        tracksCoverage: true,
      };
    case "known_won_value":
      return {
        entity: "deal",
        records: snapshot.deals,
        eligible: (record) => dealRecord(record) && !record.malformed && isWonDeal(record),
        value: (record) => (dealRecord(record) ? record.value : null),
        tracksCoverage: true,
      };
    case "open_deal_count":
      return {
        entity: "deal",
        records: snapshot.deals,
        eligible: (record) => dealRecord(record) && !record.malformed && isOpenDeal(record),
        value: () => undefined,
        tracksCoverage: false,
      };
    case "won_deal_count":
      return {
        entity: "deal",
        records: snapshot.deals,
        eligible: (record) => dealRecord(record) && !record.malformed && isWonDeal(record),
        value: () => undefined,
        tracksCoverage: false,
      };
    case "active_work_order_count":
      return {
        entity: "work_order",
        records: snapshot.workOrders,
        eligible: (record) => workOrderRecord(record) && !record.malformed && isActiveWorkOrder(record),
        value: () => undefined,
        tracksCoverage: false,
      };
    case "receivables":
      return workOrderValuePopulation(snapshot, (workOrder) => workOrder.amountReceivable);
    case "total_work_order_value":
      return workOrderValuePopulation(snapshot, (workOrder) => workOrder.amountInclGst);
    case "billed_value":
      return workOrderValuePopulation(snapshot, (workOrder) => workOrder.billedValueInclGst);
    case "collected_value":
      return workOrderValuePopulation(snapshot, (workOrder) => workOrder.collectedAmountInclGst);
    case "to_be_billed":
      return workOrderValuePopulation(snapshot, (workOrder) => workOrder.amountToBeBilledInclGst);
  }
}

function workOrderValuePopulation(
  snapshot: BusinessDataSnapshot,
  accessor: (workOrder: WorkOrder) => number | null,
): MetricPopulation {
  return {
    entity: "work_order",
    records: snapshot.workOrders,
    eligible: (record) => workOrderRecord(record) && !record.malformed,
    value: (record) => (workOrderRecord(record) ? accessor(record) : null),
    tracksCoverage: true,
  };
}

function quarterForDeal(deal: Deal): string | null {
  const date = deal.closeDate ?? deal.tentativeCloseDate;
  if (!date) return null;
  const [yearText, monthText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}

function dimensionValue(record: EntityRecord, entity: SourceEntity, dimension: DimensionId): string | null {
  if (entity === "deal" && dealRecord(record)) {
    switch (dimension) {
      case "sector": return record.sector?.trim() || "Unknown";
      case "stage": return record.stage?.trim() || "Unknown";
      case "client": return record.normalizedClientKey;
      case "quarter": return quarterForDeal(record);
      case "status": return record.status?.trim() || "Unknown";
      default: return null;
    }
  }

  if (entity === "work_order" && workOrderRecord(record)) {
    switch (dimension) {
      case "sector": return record.sector?.trim() || "Unknown";
      case "client": return record.normalizedClientKey;
      case "work_order_status": return classifyWorkOrderStatus(record);
      case "billing_status": return record.billingStatus?.trim() || "Unknown";
      case "collection_status": return record.collectionStatus?.trim() || "Unknown";
      default: return null;
    }
  }

  return null;
}

function matchesFilter(record: EntityRecord, entity: SourceEntity, filter: LineageFilter): boolean {
  if ("dimension" in filter) {
    const actual = dimensionValue(record, entity, filter.dimension);
    if (actual === null) return false;
    const normalizedActual = normalizeLabel(actual);
    const normalizedExpected = filter.values.map(normalizeLabel);
    return filter.operator === "eq"
      ? normalizedExpected.length === 1 && normalizedActual === normalizedExpected[0]
      : normalizedExpected.includes(normalizedActual);
  }

  if (entity !== "deal" || !dealRecord(record)) return false;
  if (filter.field === "deal_ids") return filter.values.includes(record.mondayItemId);
  if (record.value === null) return false;
  return filter.operator === "gte"
    ? record.value >= filter.value
    : record.value <= filter.value;
}

function filterApplies(metricId: MetricId, entity: SourceEntity, filter: LineageFilter): boolean {
  if ("dimension" in filter) {
    return getMetricDefinition(metricId).validDimensions.includes(filter.dimension);
  }
  return entity === "deal";
}

function filterReason(filter: LineageFilter): string {
  if ("dimension" in filter) return `excluded by ${filter.dimension} filter`;
  if (filter.field === "deal_ids") return "excluded by grounded Deal ID scope";
  return filter.operator === "gte"
    ? "excluded by minimum Deal value filter"
    : "excluded by maximum Deal value filter";
}

function reference(entity: SourceEntity, record: EntityRecord): RecordReference {
  return { entity, id: record.mondayItemId };
}

function metricLineage(
  metricId: MetricId,
  snapshot: BusinessDataSnapshot,
  filters: LineageFilter[],
): MetricRecordLineage {
  const population = metricPopulation(metricId, snapshot);
  const applicableFilters = filters.filter((filter) => filterApplies(metricId, population.entity, filter));
  const included: EntityRecord[] = [];
  const excluded: ExcludedRecordReference[] = [];

  for (const record of population.records) {
    const reasons: string[] = [];
    if (record.malformed) reasons.push("malformed source record");
    if (!population.eligible(record) && !record.malformed) reasons.push(`outside ${metricId} canonical population`);
    if (population.eligible(record)) {
      for (const filter of applicableFilters) {
        if (!matchesFilter(record, population.entity, filter)) {
          if (!("dimension" in filter) && filter.field === "deal_value" && dealRecord(record) && record.value === null) {
            reasons.push("unknown Deal value cannot satisfy explicit value threshold");
          } else {
            reasons.push(filterReason(filter));
          }
        }
      }
    }

    if (reasons.length === 0) included.push(record);
    else excluded.push({ ...reference(population.entity, record), reasons: [...new Set(reasons)] });
  }

  const knownValueCount = population.tracksCoverage
    ? included.filter((record) => population.value(record) !== null && population.value(record) !== undefined).length
    : null;
  const unknownValueCount = population.tracksCoverage
    ? included.length - (knownValueCount ?? 0)
    : null;

  return {
    metricId,
    recordsIncluded: included.map((record) => reference(population.entity, record)),
    recordsExcluded: excluded,
    knownValueCount,
    unknownValueCount,
  };
}

function exactClientJoinLineage(snapshot: BusinessDataSnapshot): JoinLineage {
  const dealKeys = new Set(
    snapshot.deals
      .filter((deal) => !deal.malformed && deal.normalizedClientKey)
      .map((deal) => deal.normalizedClientKey as string),
  );
  const workOrderKeys = new Set(
    snapshot.workOrders
      .filter((workOrder) => !workOrder.malformed && workOrder.normalizedClientKey)
      .map((workOrder) => workOrder.normalizedClientKey as string),
  );
  const unmatched = [...workOrderKeys].filter((key) => !dealKeys.has(key)).sort();
  return {
    joinId: CLIENT_EXACT_JOIN_ID,
    totalKeys: workOrderKeys.size,
    matchedKeys: workOrderKeys.size - unmatched.length,
    unmatchedKeys: unmatched.length,
    unmatchedKeyValues: unmatched,
  };
}

export interface BuildAnswerLineageInput {
  metricIds: MetricId[];
  snapshot: BusinessDataSnapshot;
  analysisTimestamp: string;
  filters?: LineageFilter[];
  timeRange?: LineageTimeRange;
  joinIds?: string[];
}

export function buildAnswerLineage(input: BuildAnswerLineageInput): AnswerLineage {
  const metricIds = [...new Set(input.metricIds)];
  const filters = input.filters ?? [];
  const metricRecords = metricIds.map((metricId) => metricLineage(metricId, input.snapshot, filters));

  const includedMap = new Map<string, RecordReference>();
  const excludedMap = new Map<string, ExcludedRecordReference>();
  for (const metric of metricRecords) {
    for (const record of metric.recordsIncluded) {
      includedMap.set(`${record.entity}:${record.id}`, record);
    }
    for (const record of metric.recordsExcluded) {
      const key = `${record.entity}:${record.id}`;
      const existing = excludedMap.get(key);
      excludedMap.set(key, {
        ...record,
        reasons: [...new Set([...(existing?.reasons ?? []), ...record.reasons])],
      });
    }
  }

  const joinPath = (input.joinIds ?? []).map((joinId) => {
    if (joinId !== CLIENT_EXACT_JOIN_ID) throw new Error(`Unsupported lineage join: ${joinId}`);
    return exactClientJoinLineage(input.snapshot);
  });

  return {
    metricIds,
    filters,
    timeRange: input.timeRange,
    sourceSnapshot: {
      provider: input.snapshot.source.provider,
      fetchedAt: input.snapshot.source.fetchedAt,
    },
    sourceBoards: [
      {
        entity: "deal",
        boardId: input.snapshot.source.dealsBoardId,
        boardName: input.snapshot.source.dealsBoardName,
      },
      {
        entity: "work_order",
        boardId: input.snapshot.source.workOrdersBoardId,
        boardName: input.snapshot.source.workOrdersBoardName,
      },
    ],
    recordsIncluded: [...includedMap.values()],
    recordsExcluded: [...excludedMap.values()],
    metricRecords,
    joinPath,
    semanticVersions: Object.fromEntries(
      metricIds.map((metricId) => [metricId, getMetricDefinition(metricId).semanticVersion]),
    ) as AnswerLineage["semanticVersions"],
    analysisTimestamp: input.analysisTimestamp,
  };
}
