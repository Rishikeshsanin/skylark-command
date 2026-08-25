import type {
  ClientIntelligence,
  CrossBoardClientSummary,
  Deal,
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

export function summarizeCrossBoardClients(
  deals: Deal[],
  workOrders: WorkOrder[],
  asOfDate: string,
): CrossBoardClientSummary {
  const dealKeys = new Set(
    deals
      .filter((deal) => !deal.malformed && deal.normalizedClientKey)
      .map((deal) => deal.normalizedClientKey as string),
  );
  const workOrderKeys = new Set(
    workOrders
      .filter((workOrder) => !workOrder.malformed && workOrder.normalizedClientKey)
      .map((workOrder) => workOrder.normalizedClientKey as string),
  );
  const matchedKeys = [...workOrderKeys]
    .filter((key) => dealKeys.has(key))
    .sort();
  const unmatchedWorkOrderClientKeys = [...workOrderKeys]
    .filter((key) => !dealKeys.has(key))
    .sort();
  const matchedKeySet = new Set(matchedKeys);
  const matchedClients = buildClientIntelligence(deals, workOrders, asOfDate)
    .filter((client) => matchedKeySet.has(client.normalizedClientKey))
    .sort((a, b) => a.normalizedClientKey.localeCompare(b.normalizedClientKey));

  return {
    totalUniqueWorkOrderClientKeys: workOrderKeys.size,
    matchedUniqueWorkOrderClientKeys: matchedKeys.length,
    unmatchedUniqueWorkOrderClientKeys: unmatchedWorkOrderClientKeys.length,
    unmatchedWorkOrderClientKeys,
    matchedClients,
  };
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
