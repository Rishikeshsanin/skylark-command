import type {
  ChangeSignal,
  Customer360,
  Customer360DealStage,
  Customer360HistoryPoint,
  DataQualityIssue,
  FounderAttentionFeed,
  HistoricalBusinessSnapshot,
} from "../../types";
import {
  classifyWorkOrderStatus,
  incrementDistribution,
  isActiveWorkOrder,
  isDelayedWorkOrder,
  isOpenDeal,
  isWonDeal,
  normalizeLabel,
  sumKnown,
} from "./helpers";

function customerDeals(snapshot: HistoricalBusinessSnapshot, key: string) {
  return snapshot.deals.filter(
    (deal) => !deal.malformed && deal.normalizedClientKey === key,
  );
}

function customerWorkOrders(snapshot: HistoricalBusinessSnapshot, key: string) {
  return snapshot.workOrders.filter(
    (workOrder) => !workOrder.malformed && workOrder.normalizedClientKey === key,
  );
}

function relevantDealTimestamp(deal: ReturnType<typeof customerDeals>[number]): number {
  const value = deal.tentativeCloseDate ?? deal.closeDate ?? deal.createdDate;
  return value ? Date.parse(`${value}T00:00:00Z`) : 0;
}

function buildDealStages(deals: ReturnType<typeof customerDeals>): Customer360DealStage[] {
  const groups = new Map<string, ReturnType<typeof customerDeals>>();
  for (const deal of deals) {
    const stage = deal.stage?.trim() || "Unknown";
    groups.set(stage, [...(groups.get(stage) ?? []), deal]);
  }
  return [...groups.entries()]
    .map(([stage, rows]) => ({
      stage,
      dealCount: rows.length,
      knownValue: sumKnown(rows.map((deal) => deal.value)),
      unknownValueDeals: rows.filter((deal) => deal.value === null).length,
    }))
    .sort(
      (a, b) =>
        b.knownValue - a.knownValue ||
        b.dealCount - a.dealCount ||
        a.stage.localeCompare(b.stage),
    );
}

function historyPoint(
  snapshot: HistoricalBusinessSnapshot,
  key: string,
): Customer360HistoryPoint {
  const deals = customerDeals(snapshot, key);
  const workOrders = customerWorkOrders(snapshot, key);
  const asOfDate = snapshot.capturedAt.slice(0, 10);
  return {
    snapshotId: snapshot.snapshotId,
    capturedAt: snapshot.capturedAt,
    openDeals: deals.filter(isOpenDeal).length,
    wonDeals: deals.filter(isWonDeal).length,
    knownOpenPipelineValue: sumKnown(deals.filter(isOpenDeal).map((deal) => deal.value)),
    knownWonValue: sumKnown(deals.filter(isWonDeal).map((deal) => deal.value)),
    activeWorkOrders: workOrders.filter(isActiveWorkOrder).length,
    delayedWorkOrders: workOrders.filter((workOrder) => isDelayedWorkOrder(workOrder, asOfDate)).length,
    receivables: sumKnown(workOrders.map((workOrder) => workOrder.amountReceivable)),
    billedValueInclGst: sumKnown(workOrders.map((workOrder) => workOrder.billedValueInclGst)),
    collectedAmountInclGst: sumKnown(workOrders.map((workOrder) => workOrder.collectedAmountInclGst)),
  };
}

function customerIssues(
  issues: DataQualityIssue[],
  dealItemIds: string[],
  workOrderItemIds: string[],
): DataQualityIssue[] {
  const evidence = new Set([...dealItemIds, ...workOrderItemIds]);
  return issues
    .filter((issue) => issue.entityId && evidence.has(issue.entityId))
    .sort(
      (a, b) =>
        a.severity.localeCompare(b.severity) ||
        a.code.localeCompare(b.code) ||
        (a.entityId ?? "").localeCompare(b.entityId ?? ""),
    );
}

export function buildCustomer360(
  normalizedClientKey: string,
  current: HistoricalBusinessSnapshot,
  historicalSnapshots: HistoricalBusinessSnapshot[] = [current],
  founderAttention: FounderAttentionFeed | null = null,
  changeSignals: ChangeSignal[] = [],
): Customer360 | null {
  const key = normalizedClientKey.trim();
  if (!key) return null;

  const deals = customerDeals(current, key).sort(
    (a, b) =>
      relevantDealTimestamp(b) - relevantDealTimestamp(a) ||
      a.mondayItemId.localeCompare(b.mondayItemId),
  );
  const workOrders = customerWorkOrders(current, key).sort(
    (a, b) =>
      Date.parse(`${a.probableStartDate ?? "1970-01-01"}T00:00:00Z`) -
        Date.parse(`${b.probableStartDate ?? "1970-01-01"}T00:00:00Z`) ||
      a.mondayItemId.localeCompare(b.mondayItemId),
  );
  if (deals.length === 0 && workOrders.length === 0) return null;

  const asOfDate = current.capturedAt.slice(0, 10);
  const openDeals = deals.filter(isOpenDeal);
  const wonDeals = deals.filter(isWonDeal);
  const executionStatusDistribution: Record<string, number> = {};
  for (const workOrder of workOrders) {
    incrementDistribution(executionStatusDistribution, workOrder.executionStatus);
  }

  const dealItemIds = deals.map((deal) => deal.mondayItemId).sort();
  const workOrderItemIds = workOrders.map((workOrder) => workOrder.mondayItemId).sort();
  const knownDealValueRecords = deals.filter((deal) => deal.value !== null).length;
  const unknownDealValueRecords = deals.length - knownDealValueRecords;
  const knownWorkOrderValueRecords = workOrders.filter(
    (workOrder) => workOrder.amountInclGst !== null,
  ).length;
  const unknownWorkOrderValueRecords = workOrders.length - knownWorkOrderValueRecords;
  const knownReceivableRecords = workOrders.filter(
    (workOrder) => workOrder.amountReceivable !== null,
  ).length;
  const unknownReceivableRecords = workOrders.length - knownReceivableRecords;

  const trustCaveats: string[] = [
    "Customer identity uses exact canonical normalizedClientKey equality only; no fuzzy matching is attempted.",
  ];
  if (unknownDealValueRecords > 0) {
    trustCaveats.push(`${unknownDealValueRecords} Deal record(s) have unknown monetary value and are excluded from known-value totals.`);
  }
  if (unknownWorkOrderValueRecords > 0) {
    trustCaveats.push(`${unknownWorkOrderValueRecords} Work Order record(s) have unknown GST-inclusive value.`);
  }
  if (unknownReceivableRecords > 0) {
    trustCaveats.push(`${unknownReceivableRecords} Work Order record(s) have unknown receivable value.`);
  }
  if (deals.length === 0 || workOrders.length === 0) {
    trustCaveats.push("This customer is not represented on both boards in the current snapshot.");
  }

  const uniqueHistory = new Map<string, HistoricalBusinessSnapshot>();
  for (const snapshot of historicalSnapshots) {
    if (!uniqueHistory.has(snapshot.snapshotId)) uniqueHistory.set(snapshot.snapshotId, snapshot);
  }
  const history = [...uniqueHistory.values()]
    .sort(
      (a, b) =>
        Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
        a.snapshotId.localeCompare(b.snapshotId),
    )
    .filter(
      (snapshot) =>
        customerDeals(snapshot, key).length > 0 ||
        customerWorkOrders(snapshot, key).length > 0,
    )
    .map((snapshot) => historyPoint(snapshot, key));

  return {
    normalizedClientKey: key,
    commercial: {
      openDeals,
      wonDeals,
      allDeals: deals,
      knownOpenPipelineValue: sumKnown(openDeals.map((deal) => deal.value)),
      knownWonValue: sumKnown(wonDeals.map((deal) => deal.value)),
      dealStages: buildDealStages(deals),
      knownDealValueRecords,
      unknownDealValueRecords,
    },
    operations: {
      workOrders,
      totalWorkOrders: workOrders.length,
      activeWorkOrders: workOrders.filter(isActiveWorkOrder).length,
      completedWorkOrders: workOrders.filter(
        (workOrder) => classifyWorkOrderStatus(workOrder) === "completed",
      ).length,
      delayedWorkOrders: workOrders.filter((workOrder) =>
        isDelayedWorkOrder(workOrder, asOfDate),
      ).length,
      pausedWorkOrders: workOrders.filter(
        (workOrder) => classifyWorkOrderStatus(workOrder) === "paused",
      ).length,
      executionStatusDistribution,
    },
    cash: {
      knownWorkOrderValueInclGst: sumKnown(workOrders.map((workOrder) => workOrder.amountInclGst)),
      billedValueInclGst: sumKnown(workOrders.map((workOrder) => workOrder.billedValueInclGst)),
      collectedAmountInclGst: sumKnown(workOrders.map((workOrder) => workOrder.collectedAmountInclGst)),
      receivables: sumKnown(workOrders.map((workOrder) => workOrder.amountReceivable)),
      amountToBeBilledInclGst: sumKnown(workOrders.map((workOrder) => workOrder.amountToBeBilledInclGst)),
      arPriorityWorkOrders: workOrders.filter(
        (workOrder) => normalizeLabel(workOrder.arPriority) === "priority",
      ).length,
      unknownWorkOrderValueRecords,
      unknownReceivableRecords,
    },
    trust: {
      matchedAcrossBoards: deals.length > 0 && workOrders.length > 0,
      joinEvidence: { dealItemIds, workOrderItemIds },
      dataQualityIssues: customerIssues(
        current.normalizationIssues ?? [],
        dealItemIds,
        workOrderItemIds,
      ),
      knownDealValueRecords,
      unknownDealValueRecords,
      knownWorkOrderValueRecords,
      unknownWorkOrderValueRecords,
      knownReceivableRecords,
      unknownReceivableRecords,
      caveats: trustCaveats,
    },
    history,
    attention: {
      founderAttentionItems: (founderAttention?.items ?? [])
        .filter((item) => item.client === key)
        .sort(
          (a, b) =>
            a.severity.localeCompare(b.severity) ||
            a.title.localeCompare(b.title) ||
            a.entity.localeCompare(b.entity),
        ),
      changeSignals: changeSignals
        .filter((signal) => signal.affected.customer === key)
        .sort((a, b) => a.id.localeCompare(b.id)),
    },
  };
}
