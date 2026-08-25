import type {
  CustomerRankingEntry,
  CustomerRankingResult,
  Deal,
  WorkOrder,
} from "../../types";
import {
  classifyWorkOrderStatus,
  isActiveWorkOrder,
  isDelayedWorkOrder,
  isOpenDeal,
  isWonDeal,
  normalizeLabel,
  roundAmount,
  sumKnown,
} from "./helpers";

function usableDeals(deals: Deal[]): Deal[] {
  return deals.filter((deal) => !deal.malformed);
}

function usableWorkOrders(workOrders: WorkOrder[]): WorkOrder[] {
  return workOrders.filter((workOrder) => !workOrder.malformed);
}

function buildEntry(key: string, deals: Deal[], workOrders: WorkOrder[], asOfDate: string): CustomerRankingEntry {
  const wonDeals = deals.filter(isWonDeal);
  const openDeals = deals.filter(isOpenDeal);
  const activeWorkOrders = workOrders.filter(isActiveWorkOrder);
  const delayedWorkOrders = workOrders.filter((workOrder) => isDelayedWorkOrder(workOrder, asOfDate));
  const pausedWorkOrders = workOrders.filter((workOrder) => classifyWorkOrderStatus(workOrder) === "paused");
  const arPriorityWorkOrders = workOrders.filter((workOrder) => normalizeLabel(workOrder.arPriority) === "priority");
  const knownDealValues = deals.filter((deal) => deal.value !== null).length;
  const unknownDealValues = deals.length - knownDealValues;
  const wonValue = sumKnown(wonDeals.map((deal) => deal.value));
  const openPipelineValue = sumKnown(openDeals.map((deal) => deal.value));
  const workOrderValueInclGst = sumKnown(workOrders.map((workOrder) => workOrder.amountInclGst));
  const receivables = sumKnown(workOrders.map((workOrder) => workOrder.amountReceivable));
  const executionRiskScore =
    delayedWorkOrders.length * 4 +
    pausedWorkOrders.length * 4 +
    arPriorityWorkOrders.length * 3 +
    activeWorkOrders.length;
  const caveats: string[] = [];
  if (unknownDealValues > 0) caveats.push(`${unknownDealValues} contributing deal record(s) have missing monetary values.`);
  const unknownWorkOrderValues = workOrders.filter((workOrder) => workOrder.amountInclGst === null).length;
  if (unknownWorkOrderValues > 0) caveats.push(`${unknownWorkOrderValues} contributing Work Order record(s) have missing GST-inclusive amount values.`);
  const unknownReceivables = workOrders.filter((workOrder) => workOrder.amountReceivable === null).length;
  if (unknownReceivables > 0) caveats.push(`${unknownReceivables} contributing Work Order record(s) have missing receivable values.`);

  return {
    normalizedClientKey: key,
    rank: 0,
    deterministicBasis: "",
    recordsUsed: {
      deals: deals.length,
      workOrders: workOrders.length,
      total: deals.length + workOrders.length,
    },
    monetaryValues: {
      wonValue,
      openPipelineValue,
      workOrderValueInclGst,
      receivables,
      combinedExposure: roundAmount(wonValue + openPipelineValue + workOrderValueInclGst + receivables),
      knownDealValueRecords: knownDealValues,
      unknownDealValueRecords: unknownDealValues,
    },
    operationalValues: {
      workOrderCount: workOrders.length,
      activeWorkOrders: activeWorkOrders.length,
      delayedWorkOrders: delayedWorkOrders.length,
      pausedWorkOrders: pausedWorkOrders.length,
      arPriorityWorkOrders: arPriorityWorkOrders.length,
      executionRiskScore,
    },
    evidence: {
      dealItemIds: deals.map((deal) => deal.mondayItemId).sort(),
      workOrderItemIds: workOrders.map((workOrder) => workOrder.mondayItemId).sort(),
    },
    caveats,
  };
}

function assignCompetitionRanks(
  entries: CustomerRankingEntry[],
  tieKey: (entry: CustomerRankingEntry) => string,
): CustomerRankingEntry[] {
  let previousKey: string | null = null;
  let previousRank = 0;
  return entries.map((entry, index) => {
    const key = tieKey(entry);
    const rank = previousKey !== null && key === previousKey ? previousRank : index + 1;
    previousKey = key;
    previousRank = rank;
    return { ...entry, rank };
  });
}

function rankingResult(
  rankingType: CustomerRankingResult["rankingType"],
  entries: CustomerRankingEntry[],
  dealRecordsAnalyzed: number,
  workOrderRecordsAnalyzed: number,
  unmatchedDealRecordsExcluded: number,
  unmatchedWorkOrderRecordsExcluded: number,
  caveats: string[],
): CustomerRankingResult {
  return {
    rankingType,
    currencyCode: "INR",
    entries,
    provenance: {
      dealRecordsAnalyzed,
      workOrderRecordsAnalyzed,
      totalRecordsAnalyzed: dealRecordsAnalyzed + workOrderRecordsAnalyzed,
    },
    unmatchedDealRecordsExcluded,
    unmatchedWorkOrderRecordsExcluded,
    caveats,
  };
}

export function rankCustomersByWonValue(deals: Deal[], asOfDate = "1970-01-01"): CustomerRankingResult {
  const won = usableDeals(deals).filter(isWonDeal);
  const mapped = won.filter((deal) => deal.normalizedClientKey !== null);
  const keys = [...new Set(mapped.map((deal) => deal.normalizedClientKey as string))];
  const entries = keys
    .map((key) => {
      const entry = buildEntry(key, mapped.filter((deal) => deal.normalizedClientKey === key), [], asOfDate);
      return { ...entry, deterministicBasis: "Descending known won Deal value; ties share rank and customer key provides stable display order." };
    })
    .sort((a, b) => b.monetaryValues.wonValue - a.monetaryValues.wonValue || a.normalizedClientKey.localeCompare(b.normalizedClientKey));
  const ranked = assignCompetitionRanks(entries, (entry) => String(entry.monetaryValues.wonValue));
  const unmatched = won.length - mapped.length;
  const caveats = ["Won-value ranking sums known Deal values only; missing values remain explicit in each entry."];
  if (unmatched > 0) caveats.push(`${unmatched} won Deal record(s) were excluded because no normalized customer key exists; no fuzzy match was attempted.`);
  return rankingResult("won_value", ranked, mapped.length, 0, unmatched, 0, caveats);
}

export function rankCustomersByOpenPipeline(deals: Deal[], asOfDate = "1970-01-01"): CustomerRankingResult {
  const open = usableDeals(deals).filter(isOpenDeal);
  const mapped = open.filter((deal) => deal.normalizedClientKey !== null);
  const keys = [...new Set(mapped.map((deal) => deal.normalizedClientKey as string))];
  const entries = keys
    .map((key) => {
      const entry = buildEntry(key, mapped.filter((deal) => deal.normalizedClientKey === key), [], asOfDate);
      return { ...entry, deterministicBasis: "Descending known open-pipeline Deal value; ties share rank and customer key provides stable display order." };
    })
    .sort((a, b) => b.monetaryValues.openPipelineValue - a.monetaryValues.openPipelineValue || a.normalizedClientKey.localeCompare(b.normalizedClientKey));
  const ranked = assignCompetitionRanks(entries, (entry) => String(entry.monetaryValues.openPipelineValue));
  const unmatched = open.length - mapped.length;
  const caveats = ["Open-pipeline ranking sums known Deal values only; missing values remain explicit in each entry."];
  if (unmatched > 0) caveats.push(`${unmatched} open Deal record(s) were excluded because no normalized customer key exists; no fuzzy match was attempted.`);
  return rankingResult("open_pipeline", ranked, mapped.length, 0, unmatched, 0, caveats);
}

export function rankCustomersByWorkOrderExecutionHealth(
  workOrders: WorkOrder[],
  asOfDate: string,
): CustomerRankingResult {
  const valid = usableWorkOrders(workOrders);
  const mapped = valid.filter((workOrder) => workOrder.normalizedClientKey !== null);
  const keys = [...new Set(mapped.map((workOrder) => workOrder.normalizedClientKey as string))];
  const entries = keys
    .map((key) => {
      const entry = buildEntry(key, [], mapped.filter((workOrder) => workOrder.normalizedClientKey === key), asOfDate);
      return {
        ...entry,
        deterministicBasis: "Higher execution-risk score ranks first: 4× delayed + 4× paused + 3× AR-priority + 1× active Work Orders; receivables then customer key provide stable ordering.",
      };
    })
    .sort(
      (a, b) =>
        b.operationalValues.executionRiskScore - a.operationalValues.executionRiskScore ||
        b.monetaryValues.receivables - a.monetaryValues.receivables ||
        a.normalizedClientKey.localeCompare(b.normalizedClientKey),
    );
  const ranked = assignCompetitionRanks(entries, (entry) => String(entry.operationalValues.executionRiskScore));
  const unmatched = valid.length - mapped.length;
  const caveats = ["Execution-health ranking is deterministic operational attention scoring, not ML prediction or a probability of failure."];
  if (unmatched > 0) caveats.push(`${unmatched} Work Order record(s) were excluded because no normalized customer key exists; no fuzzy match was attempted.`);
  return rankingResult("work_order_execution_health", ranked, 0, mapped.length, 0, unmatched, caveats);
}

export function rankCustomersByCombinedImportance(
  deals: Deal[],
  workOrders: WorkOrder[],
  asOfDate: string,
): CustomerRankingResult {
  const validDeals = usableDeals(deals);
  const validWorkOrders = usableWorkOrders(workOrders);
  const mappedDeals = validDeals.filter((deal) => deal.normalizedClientKey !== null);
  const mappedWorkOrders = validWorkOrders.filter((workOrder) => workOrder.normalizedClientKey !== null);
  const keys = [...new Set([
    ...mappedDeals.map((deal) => deal.normalizedClientKey as string),
    ...mappedWorkOrders.map((workOrder) => workOrder.normalizedClientKey as string),
  ])];
  const entries = keys
    .map((key) => {
      const entry = buildEntry(
        key,
        mappedDeals.filter((deal) => deal.normalizedClientKey === key),
        mappedWorkOrders.filter((workOrder) => workOrder.normalizedClientKey === key),
        asOfDate,
      );
      return {
        ...entry,
        deterministicBasis: "Descending combined exposure indicator = known won value + known open pipeline + Work Order value incl GST + receivables; execution-risk score then customer key provide stable ordering.",
      };
    })
    .sort(
      (a, b) =>
        b.monetaryValues.combinedExposure - a.monetaryValues.combinedExposure ||
        b.operationalValues.executionRiskScore - a.operationalValues.executionRiskScore ||
        a.normalizedClientKey.localeCompare(b.normalizedClientKey),
    );
  const ranked = assignCompetitionRanks(entries, (entry) => String(entry.monetaryValues.combinedExposure));
  const unmatchedDeals = validDeals.length - mappedDeals.length;
  const unmatchedWorkOrders = validWorkOrders.length - mappedWorkOrders.length;
  const caveats = [
    "Combined importance is an exposure indicator for prioritization, not an accounting revenue metric; its additive components can overlap economically.",
  ];
  if (unmatchedDeals > 0 || unmatchedWorkOrders > 0) {
    caveats.push(`${unmatchedDeals} Deal record(s) and ${unmatchedWorkOrders} Work Order record(s) were excluded because no normalized customer key exists; no fuzzy match was attempted.`);
  }
  return rankingResult(
    "combined_importance",
    ranked,
    mappedDeals.length,
    mappedWorkOrders.length,
    unmatchedDeals,
    unmatchedWorkOrders,
    caveats,
  );
}
