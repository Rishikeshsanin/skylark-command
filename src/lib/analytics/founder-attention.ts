import type {
  Deal,
  FounderAttentionFeed,
  FounderAttentionItem,
  WorkOrder,
} from "../../types";
import { calculateDealConcentration } from "./deals";
import {
  classifyWorkOrderStatus,
  isActiveWorkOrder,
  isDelayedWorkOrder,
  isOpenDeal,
  normalizeLabel,
  roundAmount,
  sumKnown,
} from "./helpers";
import { getDealPeriodDate } from "./periods";

interface ScoredAttentionItem extends FounderAttentionItem {
  sortAmount: number;
}

function percentile75(values: number[]): number | null {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)] ?? null;
}

function asTimestamp(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function qualityCaveat(parts: string[]): string | null {
  return parts.length > 0 ? parts.join(" ") : null;
}

export function getFounderAttentionFeed(
  deals: Deal[],
  workOrders: WorkOrder[],
  asOfDate: string,
): FounderAttentionFeed {
  const validDeals = deals.filter((deal) => !deal.malformed);
  const validWorkOrders = workOrders.filter((workOrder) => !workOrder.malformed);
  const mappedKeys = new Set<string>();
  for (const deal of validDeals) if (deal.normalizedClientKey) mappedKeys.add(deal.normalizedClientKey);
  for (const workOrder of validWorkOrders) if (workOrder.normalizedClientKey) mappedKeys.add(workOrder.normalizedClientKey);

  const clientRows = [...mappedKeys].map((key) => {
    const clientDeals = validDeals.filter((deal) => deal.normalizedClientKey === key);
    const clientWorkOrders = validWorkOrders.filter((workOrder) => workOrder.normalizedClientKey === key);
    const openDeals = clientDeals.filter(isOpenDeal);
    const activeWorkOrders = clientWorkOrders.filter(isActiveWorkOrder);
    const delayed = activeWorkOrders.filter((workOrder) => isDelayedWorkOrder(workOrder, asOfDate));
    const paused = activeWorkOrders.filter((workOrder) => classifyWorkOrderStatus(workOrder) === "paused");
    const arPriority = clientWorkOrders.filter((workOrder) => normalizeLabel(workOrder.arPriority) === "priority");
    return {
      key,
      clientDeals,
      clientWorkOrders,
      openDeals,
      activeWorkOrders,
      delayed,
      paused,
      arPriority,
      openPipelineValue: sumKnown(openDeals.map((deal) => deal.value)),
      receivables: sumKnown(clientWorkOrders.map((workOrder) => workOrder.amountReceivable)),
    };
  });

  const majorOpenThreshold = percentile75(clientRows.map((client) => client.openPipelineValue));
  const largeReceivableThreshold = percentile75(clientRows.map((client) => client.receivables));
  const highValueOpenDealThreshold = percentile75(
    validDeals.filter(isOpenDeal).map((deal) => deal.value ?? 0),
  );
  const items: ScoredAttentionItem[] = [];

  for (const client of clientRows) {
    const hasOperationalProblem = client.delayed.length > 0 || client.paused.length > 0;
    const isMajorOpen = majorOpenThreshold !== null && client.openPipelineValue >= majorOpenThreshold && client.openPipelineValue > 0;
    if (isMajorOpen && hasOperationalProblem) {
      const missingValues = client.openDeals.filter((deal) => deal.value === null).length;
      items.push({
        severity: "HIGH",
        title: "Major open opportunity overlaps execution risk",
        client: client.key,
        entity: client.key,
        reason: "A top-quartile open-pipeline customer also has delayed or paused active Work Orders.",
        evidenceMetrics: {
          openPipelineValue: client.openPipelineValue,
          activeWorkOrders: client.activeWorkOrders.length,
          delayedWorkOrders: client.delayed.length,
          pausedWorkOrders: client.paused.length,
          receivables: client.receivables,
        },
        relevantSource: "cross_board",
        dataQualityCaveat: qualityCaveat([
          missingValues > 0 ? `${missingValues} open Deal value(s) are missing.` : "",
        ].filter(Boolean)),
        recommendedAttentionCategory: "commercial_and_delivery",
        evidence: {
          dealItemIds: client.openDeals.map((deal) => deal.mondayItemId).sort(),
          workOrderItemIds: [...client.delayed, ...client.paused].map((workOrder) => workOrder.mondayItemId).sort(),
        },
        sortAmount: roundAmount(client.openPipelineValue + client.receivables),
      });
    }

    const isLargeReceivable = largeReceivableThreshold !== null && client.receivables >= largeReceivableThreshold && client.receivables > 0;
    if ((isLargeReceivable || client.arPriority.length > 0) && client.receivables > 0) {
      const unknownReceivables = client.clientWorkOrders.filter((workOrder) => workOrder.amountReceivable === null).length;
      items.push({
        severity: "HIGH",
        title: client.arPriority.length > 0 ? "AR-priority receivable exposure" : "Large receivable exposure",
        client: client.key,
        entity: client.key,
        reason: client.arPriority.length > 0
          ? "The customer is marked AR Priority and has outstanding receivables."
          : "The customer's receivables are in the top quartile of positive customer receivable exposure.",
        evidenceMetrics: {
          receivables: client.receivables,
          arPriorityWorkOrders: client.arPriority.length,
          workOrders: client.clientWorkOrders.length,
        },
        relevantSource: "work_orders",
        dataQualityCaveat: unknownReceivables > 0 ? `${unknownReceivables} Work Order receivable value(s) are missing.` : null,
        recommendedAttentionCategory: "collections",
        evidence: {
          dealItemIds: [],
          workOrderItemIds: client.clientWorkOrders.map((workOrder) => workOrder.mondayItemId).sort(),
        },
        sortAmount: client.receivables,
      });
    }
  }

  const asOf = asTimestamp(asOfDate);
  for (const deal of validDeals.filter(isOpenDeal)) {
    const periodDate = getDealPeriodDate(deal);
    const stale = periodDate !== null && asTimestamp(periodDate) < asOf;
    const highValue = highValueOpenDealThreshold !== null && deal.value !== null && deal.value >= highValueOpenDealThreshold;
    if (stale && highValue) {
      items.push({
        severity: "MEDIUM",
        title: "High-value open deal has stale close timing",
        client: deal.normalizedClientKey,
        entity: deal.name,
        reason: "The open Deal is top-quartile by known open value and its source close/tentative close date is before the analysis date.",
        evidenceMetrics: {
          dealValue: deal.value,
          closeDate: periodDate,
          stage: deal.stage,
        },
        relevantSource: "deals",
        dataQualityCaveat: deal.normalizedClientKey ? null : "No normalized customer key is available; no fuzzy customer match was attempted.",
        recommendedAttentionCategory: "pipeline_hygiene",
        evidence: { dealItemIds: [deal.mondayItemId], workOrderItemIds: [] },
        sortAmount: deal.value ?? 0,
      });
    }
  }

  for (const workOrder of validWorkOrders) {
    const delayed = isDelayedWorkOrder(workOrder, asOfDate);
    const paused = classifyWorkOrderStatus(workOrder) === "paused";
    if (!delayed && !paused) continue;
    const caveats: string[] = [];
    if (!workOrder.normalizedClientKey) caveats.push("No normalized customer key is available; no fuzzy customer match was attempted.");
    if (workOrder.amountInclGst === null) caveats.push("Work Order amount incl GST is missing.");
    items.push({
      severity: "MEDIUM",
      title: paused ? "Paused Work Order needs operating attention" : "Delayed Work Order needs operating attention",
      client: workOrder.normalizedClientKey,
      entity: workOrder.serialNumber ?? workOrder.name,
      reason: paused
        ? "The Work Order is in a paused/stuck execution bucket."
        : "The active Work Order's relevant probable start/end date is before the analysis date.",
      evidenceMetrics: {
        amountInclGst: workOrder.amountInclGst,
        amountReceivable: workOrder.amountReceivable,
        executionStatus: workOrder.executionStatus,
        probableStartDate: workOrder.probableStartDate,
        probableEndDate: workOrder.probableEndDate,
      },
      relevantSource: "work_orders",
      dataQualityCaveat: qualityCaveat(caveats),
      recommendedAttentionCategory: "delivery_execution",
      evidence: { dealItemIds: [], workOrderItemIds: [workOrder.mondayItemId] },
      sortAmount: roundAmount((workOrder.amountInclGst ?? 0) + (workOrder.amountReceivable ?? 0)),
    });
  }

  const concentration = calculateDealConcentration(validDeals);
  if (concentration.topClientShare !== null && concentration.topClientShare >= 0.35) {
    const openByClient = new Map<string, number>();
    for (const deal of validDeals.filter((deal) => isOpenDeal(deal) && deal.value !== null && deal.normalizedClientKey)) {
      const key = deal.normalizedClientKey as string;
      openByClient.set(key, roundAmount((openByClient.get(key) ?? 0) + (deal.value ?? 0)));
    }
    const top = [...openByClient.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (top) {
      items.push({
        severity: "MEDIUM",
        title: "Open pipeline concentration is elevated",
        client: top[0],
        entity: top[0],
        reason: "The largest normalized customer represents at least 35% of known open-pipeline value.",
        evidenceMetrics: {
          topClientOpenPipelineValue: concentration.topClientValue,
          topClientShare: concentration.topClientShare,
          knownOpenPipelineValue: concentration.knownOpenPipelineValue,
        },
        relevantSource: "deals",
        dataQualityCaveat: validDeals.some((deal) => isOpenDeal(deal) && deal.value === null)
          ? "Some open Deal values are missing; concentration uses known values only."
          : null,
        recommendedAttentionCategory: "commercial_concentration",
        evidence: {
          dealItemIds: validDeals.filter((deal) => isOpenDeal(deal) && deal.normalizedClientKey === top[0]).map((deal) => deal.mondayItemId).sort(),
          workOrderItemIds: [],
        },
        sortAmount: concentration.topClientValue,
      });
    }
  }

  const severityOrder: Record<FounderAttentionItem["severity"], number> = { HIGH: 0, MEDIUM: 1 };
  const sorted = items.sort(
    (a, b) =>
      severityOrder[a.severity] - severityOrder[b.severity] ||
      b.sortAmount - a.sortAmount ||
      (a.client ?? a.entity).localeCompare(b.client ?? b.entity) ||
      a.title.localeCompare(b.title),
  );

  return {
    asOfDate,
    currencyCode: "INR",
    items: sorted.map(({ sortAmount, ...item }) => {
      void sortAmount;
      return item;
    }),
    provenance: {
      dealRecordsAnalyzed: validDeals.length,
      workOrderRecordsAnalyzed: validWorkOrders.length,
      totalRecordsAnalyzed: validDeals.length + validWorkOrders.length,
    },
    caveats: [
      "Founder attention feed is deterministic decision support, not ML prediction or a probability forecast.",
      "Top-quartile thresholds are calculated from positive known values in the supplied dataset; missing monetary values are never replaced with zero for threshold eligibility.",
    ],
  };
}
