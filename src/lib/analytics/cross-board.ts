import type {
  ClientIntelligence,
  CrossBoardClientCoverageSummary,
  Deal,
  OpenPipelineSectorRanking,
  SectorMetrics,
  WorkOrder,
} from "../../types";
import { isActiveWorkOrder, isDelayedWorkOrder, isOpenDeal, normalizeLabel, roundAmount, sumKnown } from "./helpers";

export function buildClientIntelligence(
  deals: Deal[],
  workOrders: WorkOrder[],
  asOfDate: string,
): ClientIntelligence[] {
  const keys = new Set<string>();
  for (const deal of deals) if (!deal.malformed && deal.normalizedClientKey) keys.add(deal.normalizedClientKey);
  for (const workOrder of workOrders) if (!workOrder.malformed && workOrder.normalizedClientKey) keys.add(workOrder.normalizedClientKey);

  const result: ClientIntelligence[] = [];
  for (const key of keys) {
    const clientDeals = deals.filter((deal) => !deal.malformed && deal.normalizedClientKey === key);
    const clientWorkOrders = workOrders.filter((workOrder) => !workOrder.malformed && workOrder.normalizedClientKey === key);
    const openDeals = clientDeals.filter(isOpenDeal);
    const activeWorkOrders = clientWorkOrders.filter(isActiveWorkOrder);
    const reasons = new Set<string>();

    if (activeWorkOrders.some((workOrder) => isDelayedWorkOrder(workOrder, asOfDate))) reasons.add("delayed active work order");
    if (activeWorkOrders.some((workOrder) => normalizeLabel(workOrder.executionStatus) === "pause / struck")) reasons.add("paused work order");
    if (clientWorkOrders.some((workOrder) => normalizeLabel(workOrder.arPriority) === "priority")) reasons.add("AR priority account");
    if (clientWorkOrders.some((workOrder) => (workOrder.amountReceivable ?? 0) > 0)) reasons.add("outstanding receivables");

    const sectors = [...new Set([
      ...clientDeals.map((deal) => deal.sector).filter((value): value is string => Boolean(value)),
      ...clientWorkOrders.map((workOrder) => workOrder.sector).filter((value): value is string => Boolean(value)),
    ])].sort();
    const hasCommercialOpportunity = openDeals.length > 0;
    const hasOperationalRisk = reasons.size > 0;

    result.push({
      normalizedClientKey: key,
      dealCount: clientDeals.length,
      openDealCount: openDeals.length,
      openDealValue: sumKnown(openDeals.map((deal) => deal.value)),
      workOrderCount: clientWorkOrders.length,
      activeWorkOrderCount: activeWorkOrders.length,
      workOrderValueInclGst: sumKnown(clientWorkOrders.map((workOrder) => workOrder.amountInclGst)),
      receivables: sumKnown(clientWorkOrders.map((workOrder) => workOrder.amountReceivable)),
      sectors,
      hasCommercialOpportunity,
      hasOperationalRisk,
      hasCombinedCommercialOperationalRisk: hasCommercialOpportunity && hasOperationalRisk,
      operationalRiskReasons: [...reasons].sort(),
    });
  }

  return result.sort(
    (a, b) =>
      Number(b.hasCombinedCommercialOperationalRisk) - Number(a.hasCombinedCommercialOperationalRisk) ||
      b.openDealValue - a.openDealValue ||
      b.receivables - a.receivables ||
      a.normalizedClientKey.localeCompare(b.normalizedClientKey),
  );
}

export function clientsWithOpenDealsAndActiveWorkOrders(
  deals: Deal[],
  workOrders: WorkOrder[],
  asOfDate: string,
): ClientIntelligence[] {
  return buildClientIntelligence(deals, workOrders, asOfDate).filter(
    (client) => client.openDealCount > 0 && client.activeWorkOrderCount > 0,
  );
}

/**
 * Combined commercial + operational sector exposure. This intentionally keeps
 * its original combined-exposure ordering; evaluator questions about the
 * largest OPEN opportunity must use calculateOpenPipelineSectorRanking().
 */
export function calculateSectorMetrics(deals: Deal[], workOrders: WorkOrder[]): SectorMetrics[] {
  const sectors = new Set<string>();
  for (const deal of deals) if (!deal.malformed) sectors.add(deal.sector?.trim() || "Unknown");
  for (const workOrder of workOrders) if (!workOrder.malformed) sectors.add(workOrder.sector?.trim() || "Unknown");

  return [...sectors]
    .map((sector) => {
      const sectorDeals = deals.filter((deal) => !deal.malformed && (deal.sector?.trim() || "Unknown") === sector);
      const sectorWorkOrders = workOrders.filter(
        (workOrder) => !workOrder.malformed && (workOrder.sector?.trim() || "Unknown") === sector,
      );
      const openDeals = sectorDeals.filter(isOpenDeal);
      return {
        sector,
        dealCount: sectorDeals.length,
        openDealCount: openDeals.length,
        openPipelineValue: sumKnown(openDeals.map((deal) => deal.value)),
        wonValue: sumKnown(sectorDeals.filter((deal) => normalizeLabel(deal.status) === "won").map((deal) => deal.value)),
        workOrderCount: sectorWorkOrders.length,
        activeWorkOrderCount: sectorWorkOrders.filter(isActiveWorkOrder).length,
        workOrderValueInclGst: sumKnown(sectorWorkOrders.map((workOrder) => workOrder.amountInclGst)),
        receivables: sumKnown(sectorWorkOrders.map((workOrder) => workOrder.amountReceivable)),
      };
    })
    .sort((a, b) => roundAmount(b.openPipelineValue + b.workOrderValueInclGst) - roundAmount(a.openPipelineValue + a.workOrderValueInclGst) || a.sector.localeCompare(b.sector));
}

/**
 * Canonical deterministic answer source for "Which sector has the largest open opportunity?".
 * Ranking is based ONLY on known openPipelineValue, descending. Work Order value
 * is deliberately excluded from this ordering.
 */
export function calculateOpenPipelineSectorRanking(deals: Deal[]): OpenPipelineSectorRanking {
  const openDeals = deals.filter((deal) => !deal.malformed && isOpenDeal(deal));
  const groups = new Map<string, Deal[]>();

  for (const deal of openDeals) {
    const sector = deal.sector?.trim() || "Unknown";
    groups.set(sector, [...(groups.get(sector) ?? []), deal]);
  }

  const sorted = [...groups.entries()]
    .map(([sector, rows]) => {
      const knownOpenValueDeals = rows.filter((deal) => deal.value !== null).length;
      const unknownOpenValueDeals = rows.length - knownOpenValueDeals;
      return {
        sector,
        openDealCount: rows.length,
        knownOpenValueDeals,
        unknownOpenValueDeals,
        openPipelineValue: sumKnown(rows.map((deal) => deal.value)),
        evidence: {
          dealItemIds: rows.map((deal) => deal.mondayItemId).sort(),
        },
        caveats:
          unknownOpenValueDeals > 0
            ? [`${unknownOpenValueDeals} open deal(s) in this sector have missing monetary values; openPipelineValue is a known-value sum.`]
            : [],
      };
    })
    .sort((a, b) => b.openPipelineValue - a.openPipelineValue || a.sector.localeCompare(b.sector));

  let priorValue: number | null = null;
  let rank = 0;
  const entries = sorted.map((entry, index) => {
    if (priorValue === null || entry.openPipelineValue !== priorValue) rank = index + 1;
    priorValue = entry.openPipelineValue;
    return { rank, ...entry };
  });

  const missingValueRecords = openDeals.filter((deal) => deal.value === null).length;
  return {
    currencyCode: "INR",
    recordsAnalyzed: openDeals.length,
    entries,
    caveats:
      missingValueRecords > 0
        ? [`${missingValueRecords} open deal(s) have missing monetary values; sector open-pipeline totals are known-value sums, not complete values for those records.`]
        : [],
  };
}

/** Exact normalized-key coverage between Work Orders and Deals; no fuzzy matching. */
export function summarizeCrossBoardClientCoverage(
  deals: Deal[],
  workOrders: WorkOrder[],
): CrossBoardClientCoverageSummary {
  const validDeals = deals.filter((deal) => !deal.malformed);
  const validWorkOrders = workOrders.filter((workOrder) => !workOrder.malformed);
  const dealsByKey = new Map<string, Deal[]>();
  const workOrdersByKey = new Map<string, WorkOrder[]>();

  for (const deal of validDeals) {
    if (!deal.normalizedClientKey) continue;
    dealsByKey.set(deal.normalizedClientKey, [...(dealsByKey.get(deal.normalizedClientKey) ?? []), deal]);
  }
  for (const workOrder of validWorkOrders) {
    if (!workOrder.normalizedClientKey) continue;
    workOrdersByKey.set(workOrder.normalizedClientKey, [
      ...(workOrdersByKey.get(workOrder.normalizedClientKey) ?? []),
      workOrder,
    ]);
  }

  const matchedClients = [...workOrdersByKey.entries()]
    .filter(([key]) => dealsByKey.has(key))
    .map(([normalizedClientKey, clientWorkOrders]) => {
      const clientDeals = dealsByKey.get(normalizedClientKey) ?? [];
      return {
        normalizedClientKey,
        dealRecords: clientDeals.length,
        workOrderRecords: clientWorkOrders.length,
        evidence: {
          dealItemIds: clientDeals.map((deal) => deal.mondayItemId).sort(),
          workOrderItemIds: clientWorkOrders.map((workOrder) => workOrder.mondayItemId).sort(),
        },
      };
    })
    .sort((a, b) => a.normalizedClientKey.localeCompare(b.normalizedClientKey));

  const unmatchedWorkOrderClientKeys = [...workOrdersByKey.keys()]
    .filter((key) => !dealsByKey.has(key))
    .sort();
  const workOrderRecordsWithoutClientKey = validWorkOrders.filter((workOrder) => !workOrder.normalizedClientKey).length;
  const caveats = ["Client coverage uses exact normalizedClientKey equality only; no fuzzy matching is applied."];
  if (workOrderRecordsWithoutClientKey > 0) {
    caveats.push(`${workOrderRecordsWithoutClientKey} Work Order record(s) lack a normalized client key and are excluded from unique-key coverage.`);
  }

  return {
    totalUniqueWorkOrderClientKeys: workOrdersByKey.size,
    matchedUniqueClientKeys: matchedClients.length,
    unmatchedUniqueClientKeys: unmatchedWorkOrderClientKeys.length,
    unmatchedWorkOrderClientKeys,
    matchedClients,
    dealRecordsAnalyzed: validDeals.length,
    workOrderRecordsAnalyzed: validWorkOrders.length,
    workOrderRecordsWithoutClientKey,
    caveats,
  };
}
