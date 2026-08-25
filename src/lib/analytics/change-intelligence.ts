import type {
  ChangeDataCompleteness,
  ChangeIntelligenceResult,
  ChangeMethod,
  ChangeSignal,
  ChangeSignalType,
  Deal,
  HistoricalBusinessSnapshot,
  RobustDistributionSummary,
  WorkOrder,
} from "../../types";
import { calculateSectorMetrics } from "./cross-board";
import { calculatePipelineMetrics } from "./deals";
import {
  classifyWorkOrderStatus,
  isDeadDeal,
  isDelayedWorkOrder,
  isOpenDeal,
  isWonDeal,
  normalizeLabel,
  roundAmount,
  sumKnown,
} from "./helpers";
import { calculateWorkOrderHealth } from "./work-orders";

const FALLBACK_MATERIAL_PERCENT = 10;
const CUSTOMER_MATERIAL_PERCENT = 25;
const ROBUST_Z_THRESHOLD = 3.5;
const SECTOR_SHARE_POINT_THRESHOLD = 5;

const SIGNAL_ORDER: ChangeSignalType[] = [
  "open_pipeline_change",
  "receivables_change",
  "deal_newly_won",
  "deal_newly_lost",
  "deal_stage_movement",
  "deal_new_large_opportunity",
  "deal_tentative_close_movement",
  "deal_newly_stale",
  "work_order_newly_delayed",
  "work_order_newly_paused",
  "billing_collection_deterioration",
  "customer_exposure_change",
  "sector_concentration_change",
];

function roundStat(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? roundStat((sorted[middle - 1] + sorted[middle]) / 2)
    : roundStat(sorted[middle]);
}

export function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const bounded = Math.min(100, Math.max(0, percentileValue));
  const position = (bounded / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return roundStat(sorted[lower]);
  const weight = position - lower;
  return roundStat(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

export function medianAbsoluteDeviation(values: number[]): number | null {
  const center = median(values);
  if (center === null) return null;
  return median(values.map((value) => Math.abs(value - center)));
}

export function interquartileRange(values: number[]): number | null {
  const q1 = percentile(values, 25);
  const q3 = percentile(values, 75);
  return q1 === null || q3 === null ? null : roundStat(q3 - q1);
}

export function robustZScore(value: number, baseline: number[]): number | null {
  const center = median(baseline);
  const mad = medianAbsoluteDeviation(baseline);
  if (center === null || mad === null || mad === 0) return null;
  return roundStat((0.6745 * (value - center)) / mad);
}

export function summarizeRobustDistribution(values: number[]): RobustDistributionSummary {
  return {
    count: values.length,
    median: median(values),
    mad: medianAbsoluteDeviation(values),
    q1: percentile(values, 25),
    q3: percentile(values, 75),
    iqr: interquartileRange(values),
    p90: percentile(values, 90),
  };
}

function uniqueChronologicalSnapshots(snapshots: HistoricalBusinessSnapshot[]): HistoricalBusinessSnapshot[] {
  const sorted = [...snapshots].sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      a.snapshotId.localeCompare(b.snapshotId),
  );
  const seen = new Set<string>();
  return sorted.filter((snapshot) => {
    if (seen.has(snapshot.snapshotId)) return false;
    seen.add(snapshot.snapshotId);
    return true;
  });
}

function snapshotDate(snapshot: HistoricalBusinessSnapshot): string {
  return snapshot.capturedAt.slice(0, 10);
}

function percentageDelta(oldValue: number, newValue: number): number | null {
  if (oldValue === 0) return null;
  return roundStat(((newValue - oldValue) / Math.abs(oldValue)) * 100);
}

function numericDelta(oldValue: number, newValue: number): number {
  return roundAmount(newValue - oldValue);
}

function evidenceIds(records: Array<{ mondayItemId: string }>): string[] {
  return [...new Set(records.map((record) => record.mondayItemId))].sort();
}

function completeness(knownRecords: number, unknownRecords: number, note: string): ChangeDataCompleteness {
  return { knownRecords, unknownRecords, note };
}

function stateMethod(description: string): ChangeMethod {
  return { name: "state_transition", description, parameters: {} };
}

function numericMateriality(
  historyValues: number[],
  fallbackPercentThreshold = FALLBACK_MATERIAL_PERCENT,
): { material: boolean; method: ChangeMethod } {
  const oldValue = historyValues.at(-2) ?? 0;
  const newValue = historyValues.at(-1) ?? 0;
  const latestDelta = newValue - oldValue;
  const percent = percentageDelta(oldValue, newValue);
  if (latestDelta === 0) {
    return {
      material: false,
      method: {
        name: "absolute_delta",
        description: "No change between the two latest distinct snapshots.",
        parameters: { delta: 0 },
      },
    };
  }

  const priorDeltas: number[] = [];
  for (let index = 1; index < historyValues.length - 1; index += 1) {
    priorDeltas.push(historyValues[index] - historyValues[index - 1]);
  }

  if (priorDeltas.length >= 3) {
    const baseline = summarizeRobustDistribution(priorDeltas);
    const z = robustZScore(latestDelta, priorDeltas);
    const zeroDispersionBreak = baseline.mad === 0 && baseline.median !== latestDelta;
    const percentageFallback = percent !== null && Math.abs(percent) >= fallbackPercentThreshold;
    return {
      material: Boolean((z !== null && Math.abs(z) >= ROBUST_Z_THRESHOLD) || zeroDispersionBreak || percentageFallback),
      method: {
        name: "rolling_median_mad",
        description: "Latest delta compared with prior snapshot-to-snapshot deltas using the median and median absolute deviation; percentage delta remains a transparent fallback.",
        parameters: {
          priorDeltaCount: priorDeltas.length,
          medianPriorDelta: baseline.median,
          madPriorDelta: baseline.mad,
          robustZScore: z,
          robustZThreshold: ROBUST_Z_THRESHOLD,
          fallbackPercentThreshold,
          percentageDelta: percent,
          zeroDispersionBreak,
        },
      },
    };
  }

  return {
    material: oldValue === 0 ? newValue !== 0 : percent !== null && Math.abs(percent) >= fallbackPercentThreshold,
    method: {
      name: "percentage_delta",
      description: "Sparse history: materiality uses the percentage change between the two latest distinct snapshots.",
      parameters: {
        percentageDelta: percent,
        thresholdPercent: fallbackPercentThreshold,
        baselineSnapshotDeltas: priorDeltas.length,
      },
    },
  };
}

function stableSignalId(type: ChangeSignalType, entityKey: string, fromId: string, toId: string): string {
  const safeEntity = entityKey.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120) || "aggregate";
  return `${type}:${safeEntity}:${fromId}:${toId}`;
}

function affectedForDeal(deal: Deal) {
  return {
    customer: deal.normalizedClientKey,
    sector: deal.sector,
    entityId: deal.mondayItemId,
    entityName: deal.name,
  };
}

function affectedForWorkOrder(workOrder: WorkOrder) {
  return {
    customer: workOrder.normalizedClientKey,
    sector: workOrder.sector,
    entityId: workOrder.mondayItemId,
    entityName: workOrder.name,
  };
}

function aggregateSignal(
  type: "open_pipeline_change" | "receivables_change",
  title: string,
  metric: string,
  historyValues: number[],
  previous: HistoricalBusinessSnapshot,
  current: HistoricalBusinessSnapshot,
  evidence: { dealItemIds: string[]; workOrderItemIds: string[] },
  dataCompleteness: ChangeDataCompleteness,
): ChangeSignal | null {
  const oldValue = historyValues.at(-2) ?? 0;
  const newValue = historyValues.at(-1) ?? 0;
  const assessment = numericMateriality(historyValues);
  if (!assessment.material) return null;
  const delta = numericDelta(oldValue, newValue);
  return {
    id: stableSignalId(type, metric, previous.snapshotId, current.snapshotId),
    type,
    title,
    whatChanged: `${metric} ${delta >= 0 ? "increased" : "decreased"} between the two latest snapshots.`,
    direction: delta >= 0 ? "increase" : "decrease",
    metric,
    oldValue,
    newValue,
    delta,
    percentageDelta: percentageDelta(oldValue, newValue),
    timeWindow: { from: previous.capturedAt, to: current.capturedAt },
    method: assessment.method,
    evidence,
    dataCompleteness,
    sourceSnapshotIds: { from: previous.snapshotId, to: current.snapshotId },
    affected: { customer: null, sector: null, entityId: null, entityName: null },
  };
}

function isStaleDeal(deal: Deal, asOfDate: string): boolean {
  if (deal.malformed || !isOpenDeal(deal)) return false;
  const relevantDate = deal.tentativeCloseDate ?? deal.closeDate;
  if (!relevantDate) return false;
  return Date.parse(`${relevantDate}T00:00:00Z`) < Date.parse(`${asOfDate}T00:00:00Z`);
}

function mappedDeals(snapshot: HistoricalBusinessSnapshot): Map<string, Deal> {
  return new Map(snapshot.deals.filter((deal) => !deal.malformed).map((deal) => [deal.mondayItemId, deal]));
}

function mappedWorkOrders(snapshot: HistoricalBusinessSnapshot): Map<string, WorkOrder> {
  return new Map(
    snapshot.workOrders.filter((workOrder) => !workOrder.malformed).map((workOrder) => [workOrder.mondayItemId, workOrder]),
  );
}

function dealCompleteness(deal: Deal): ChangeDataCompleteness {
  return completeness(deal.value === null ? 0 : 1, deal.value === null ? 1 : 0, "Deal monetary completeness is based only on the source Deal value field.");
}

function eventSignal(
  type: ChangeSignalType,
  title: string,
  whatChanged: string,
  metric: string,
  oldValue: string | number | null,
  newValue: string | number | null,
  previous: HistoricalBusinessSnapshot,
  current: HistoricalBusinessSnapshot,
  affected: ChangeSignal["affected"],
  evidence: ChangeSignal["evidence"],
  dataCompleteness: ChangeDataCompleteness,
  methodDescription: string,
): ChangeSignal {
  const numericOld = typeof oldValue === "number" ? oldValue : null;
  const numericNew = typeof newValue === "number" ? newValue : null;
  return {
    id: stableSignalId(type, affected.entityId ?? affected.customer ?? affected.sector ?? metric, previous.snapshotId, current.snapshotId),
    type,
    title,
    whatChanged,
    direction: oldValue === null ? "new" : "changed",
    metric,
    oldValue,
    newValue,
    delta: numericOld !== null && numericNew !== null ? numericDelta(numericOld, numericNew) : null,
    percentageDelta: numericOld !== null && numericNew !== null ? percentageDelta(numericOld, numericNew) : null,
    timeWindow: { from: previous.capturedAt, to: current.capturedAt },
    method: stateMethod(methodDescription),
    evidence,
    dataCompleteness,
    sourceSnapshotIds: { from: previous.snapshotId, to: current.snapshotId },
    affected,
  };
}

interface CustomerExposure {
  combinedExposure: number;
  knownRecords: number;
  unknownRecords: number;
  dealItemIds: string[];
  workOrderItemIds: string[];
}

function customerExposure(snapshot: HistoricalBusinessSnapshot, key: string): CustomerExposure {
  const deals = snapshot.deals.filter((deal) => !deal.malformed && deal.normalizedClientKey === key);
  const workOrders = snapshot.workOrders.filter(
    (workOrder) => !workOrder.malformed && workOrder.normalizedClientKey === key,
  );
  const wonValue = sumKnown(deals.filter(isWonDeal).map((deal) => deal.value));
  const openPipeline = sumKnown(deals.filter(isOpenDeal).map((deal) => deal.value));
  const workOrderValue = sumKnown(workOrders.map((workOrder) => workOrder.amountInclGst));
  const receivables = sumKnown(workOrders.map((workOrder) => workOrder.amountReceivable));
  const knownRecords =
    deals.filter((deal) => deal.value !== null).length +
    workOrders.filter((workOrder) => workOrder.amountInclGst !== null).length +
    workOrders.filter((workOrder) => workOrder.amountReceivable !== null).length;
  const unknownRecords = deals.length + workOrders.length * 2 - knownRecords;
  return {
    combinedExposure: roundAmount(wonValue + openPipeline + workOrderValue + receivables),
    knownRecords,
    unknownRecords,
    dealItemIds: evidenceIds(deals),
    workOrderItemIds: evidenceIds(workOrders),
  };
}

function sectorConcentration(snapshot: HistoricalBusinessSnapshot): { sector: string | null; sharePct: number } {
  const sectors = calculateSectorMetrics(snapshot.deals, snapshot.workOrders);
  const total = sectors.reduce((sum, sector) => sum + sector.openPipelineValue, 0);
  if (total <= 0 || sectors.length === 0) return { sector: null, sharePct: 0 };
  const top = [...sectors].sort(
    (a, b) => b.openPipelineValue - a.openPipelineValue || a.sector.localeCompare(b.sector),
  )[0];
  return { sector: top.sector, sharePct: roundStat((top.openPipelineValue / total) * 100) };
}

function compareDealTransitions(
  previous: HistoricalBusinessSnapshot,
  current: HistoricalBusinessSnapshot,
): ChangeSignal[] {
  const before = mappedDeals(previous);
  const after = mappedDeals(current);
  const signals: ChangeSignal[] = [];
  const previousAsOf = snapshotDate(previous);
  const currentAsOf = snapshotDate(current);

  const priorKnownOpenValues = previous.deals
    .filter((deal) => !deal.malformed && isOpenDeal(deal) && deal.value !== null)
    .map((deal) => deal.value as number);
  const distribution = summarizeRobustDistribution(priorKnownOpenValues);
  const largeOpportunityThreshold = distribution.p90;

  for (const deal of [...after.values()].sort((a, b) => a.mondayItemId.localeCompare(b.mondayItemId))) {
    const oldDeal = before.get(deal.mondayItemId);
    if (oldDeal) {
      if (!isWonDeal(oldDeal) && isWonDeal(deal)) {
        signals.push(eventSignal(
          "deal_newly_won",
          "Deal moved to won",
          `${deal.name} became won.`,
          "dealStatus",
          oldDeal.status,
          deal.status,
          previous,
          current,
          affectedForDeal(deal),
          { dealItemIds: [deal.mondayItemId], workOrderItemIds: [] },
          dealCompleteness(deal),
          "Direct normalized Deal status transition into the deterministic won state.",
        ));
      }
      if (!isDeadDeal(oldDeal) && isDeadDeal(deal)) {
        signals.push(eventSignal(
          "deal_newly_lost",
          "Deal moved to lost/dead",
          `${deal.name} entered a deterministic lost/dead state.`,
          "dealStatusOrStage",
          oldDeal.status ?? oldDeal.stage,
          deal.status ?? deal.stage,
          previous,
          current,
          affectedForDeal(deal),
          { dealItemIds: [deal.mondayItemId], workOrderItemIds: [] },
          dealCompleteness(deal),
          "Direct normalized Deal status/stage transition into the deterministic dead/lost state.",
        ));
      }
      if (normalizeLabel(oldDeal.stage) !== normalizeLabel(deal.stage)) {
        signals.push(eventSignal(
          "deal_stage_movement",
          "Deal stage changed",
          `${deal.name} moved from ${oldDeal.stage ?? "Unknown"} to ${deal.stage ?? "Unknown"}.`,
          "stage",
          oldDeal.stage,
          deal.stage,
          previous,
          current,
          affectedForDeal(deal),
          { dealItemIds: [deal.mondayItemId], workOrderItemIds: [] },
          dealCompleteness(deal),
          "Direct comparison of the normalized stage value for the same monday Deal item ID.",
        ));
      }
      if (oldDeal.tentativeCloseDate !== deal.tentativeCloseDate) {
        signals.push(eventSignal(
          "deal_tentative_close_movement",
          "Tentative close date moved",
          `${deal.name} changed tentative close timing.`,
          "tentativeCloseDate",
          oldDeal.tentativeCloseDate,
          deal.tentativeCloseDate,
          previous,
          current,
          affectedForDeal(deal),
          { dealItemIds: [deal.mondayItemId], workOrderItemIds: [] },
          dealCompleteness(deal),
          "Direct comparison of tentative close date for the same monday Deal item ID.",
        ));
      }
      if (!isStaleDeal(oldDeal, previousAsOf) && isStaleDeal(deal, currentAsOf)) {
        signals.push(eventSignal(
          "deal_newly_stale",
          "Deal became stale",
          `${deal.name} is now open with a close/tentative-close date before the snapshot date.`,
          "staleness",
          "current",
          "stale",
          previous,
          current,
          affectedForDeal(deal),
          { dealItemIds: [deal.mondayItemId], workOrderItemIds: [] },
          dealCompleteness(deal),
          "Deterministic date comparison: an open Deal becomes stale when its relevant close date passes the snapshot date.",
        ));
      }
    } else if (
      isOpenDeal(deal) &&
      deal.value !== null &&
      largeOpportunityThreshold !== null &&
      deal.value >= largeOpportunityThreshold
    ) {
      signals.push({
        id: stableSignalId("deal_new_large_opportunity", deal.mondayItemId, previous.snapshotId, current.snapshotId),
        type: "deal_new_large_opportunity",
        title: "New large opportunity",
        whatChanged: `${deal.name} appeared as a new open Deal at or above the prior open-pipeline P90 threshold.`,
        direction: "new",
        metric: "dealValue",
        oldValue: null,
        newValue: deal.value,
        delta: null,
        percentageDelta: null,
        timeWindow: { from: previous.capturedAt, to: current.capturedAt },
        method: {
          name: "percentile_threshold",
          description: "New open Deal value compared with the distribution of known open Deal values in the prior snapshot.",
          parameters: {
            percentile: 90,
            p90Threshold: distribution.p90,
            q1: distribution.q1,
            q3: distribution.q3,
            iqr: distribution.iqr,
            priorKnownOpenDealValues: distribution.count,
          },
        },
        evidence: { dealItemIds: [deal.mondayItemId], workOrderItemIds: [] },
        dataCompleteness: dealCompleteness(deal),
        sourceSnapshotIds: { from: previous.snapshotId, to: current.snapshotId },
        affected: affectedForDeal(deal),
      });
    }
  }

  return signals;
}

function compareWorkOrderTransitions(
  previous: HistoricalBusinessSnapshot,
  current: HistoricalBusinessSnapshot,
): ChangeSignal[] {
  const before = mappedWorkOrders(previous);
  const after = mappedWorkOrders(current);
  const signals: ChangeSignal[] = [];
  const previousAsOf = snapshotDate(previous);
  const currentAsOf = snapshotDate(current);

  for (const workOrder of [...after.values()].sort((a, b) => a.mondayItemId.localeCompare(b.mondayItemId))) {
    const oldWorkOrder = before.get(workOrder.mondayItemId);
    if (!oldWorkOrder) continue;
    const known = workOrder.amountInclGst === null ? 0 : 1;
    const unknown = workOrder.amountInclGst === null ? 1 : 0;
    const dataCompleteness = completeness(known, unknown, "Work Order completeness for this transition uses the GST-inclusive Work Order amount field.");

    if (!isDelayedWorkOrder(oldWorkOrder, previousAsOf) && isDelayedWorkOrder(workOrder, currentAsOf)) {
      signals.push(eventSignal(
        "work_order_newly_delayed",
        "Work Order became delayed",
        `${workOrder.name} is newly delayed against its probable start/end timing.`,
        "deliveryDelayState",
        "not delayed",
        "delayed",
        previous,
        current,
        affectedForWorkOrder(workOrder),
        { dealItemIds: [], workOrderItemIds: [workOrder.mondayItemId] },
        dataCompleteness,
        "Deterministic Work Order delay classification evaluated at each snapshot date.",
      ));
    }
    if (classifyWorkOrderStatus(oldWorkOrder) !== "paused" && classifyWorkOrderStatus(workOrder) === "paused") {
      signals.push(eventSignal(
        "work_order_newly_paused",
        "Work Order became paused",
        `${workOrder.name} entered the deterministic paused/stuck execution bucket.`,
        "executionStatus",
        oldWorkOrder.executionStatus,
        workOrder.executionStatus,
        previous,
        current,
        affectedForWorkOrder(workOrder),
        { dealItemIds: [], workOrderItemIds: [workOrder.mondayItemId] },
        dataCompleteness,
        "Direct normalized execution-status transition into the paused/stuck bucket.",
      ));
    }
  }
  return signals;
}

function customerExposureSignals(
  snapshots: HistoricalBusinessSnapshot[],
  previous: HistoricalBusinessSnapshot,
  current: HistoricalBusinessSnapshot,
): ChangeSignal[] {
  const keys = new Set<string>();
  for (const snapshot of [previous, current]) {
    for (const deal of snapshot.deals) if (!deal.malformed && deal.normalizedClientKey) keys.add(deal.normalizedClientKey);
    for (const workOrder of snapshot.workOrders) if (!workOrder.malformed && workOrder.normalizedClientKey) keys.add(workOrder.normalizedClientKey);
  }

  const signals: ChangeSignal[] = [];
  for (const key of [...keys].sort()) {
    const history = snapshots.map((snapshot) => customerExposure(snapshot, key).combinedExposure);
    const assessment = numericMateriality(history, CUSTOMER_MATERIAL_PERCENT);
    if (!assessment.material) continue;
    const oldExposure = customerExposure(previous, key);
    const newExposure = customerExposure(current, key);
    const delta = numericDelta(oldExposure.combinedExposure, newExposure.combinedExposure);
    signals.push({
      id: stableSignalId("customer_exposure_change", key, previous.snapshotId, current.snapshotId),
      type: "customer_exposure_change",
      title: "Customer exposure changed materially",
      whatChanged: `${key} combined deterministic exposure indicator ${delta >= 0 ? "increased" : "decreased"}.`,
      direction: delta >= 0 ? "increase" : "decrease",
      metric: "combinedExposureIndicator",
      oldValue: oldExposure.combinedExposure,
      newValue: newExposure.combinedExposure,
      delta,
      percentageDelta: percentageDelta(oldExposure.combinedExposure, newExposure.combinedExposure),
      timeWindow: { from: previous.capturedAt, to: current.capturedAt },
      method: assessment.method,
      evidence: {
        dealItemIds: [...new Set([...oldExposure.dealItemIds, ...newExposure.dealItemIds])].sort(),
        workOrderItemIds: [...new Set([...oldExposure.workOrderItemIds, ...newExposure.workOrderItemIds])].sort(),
      },
      dataCompleteness: completeness(
        newExposure.knownRecords,
        newExposure.unknownRecords,
        "Combined exposure = known won value + known open pipeline + Work Order value incl GST + receivables. Components can overlap economically; this is an attention indicator, not revenue.",
      ),
      sourceSnapshotIds: { from: previous.snapshotId, to: current.snapshotId },
      affected: { customer: key, sector: null, entityId: null, entityName: key },
    });
  }
  return signals;
}

function sectorConcentrationSignal(
  snapshots: HistoricalBusinessSnapshot[],
  previous: HistoricalBusinessSnapshot,
  current: HistoricalBusinessSnapshot,
): ChangeSignal | null {
  const history = snapshots.map((snapshot) => sectorConcentration(snapshot).sharePct);
  const oldConcentration = sectorConcentration(previous);
  const newConcentration = sectorConcentration(current);
  const delta = roundStat(newConcentration.sharePct - oldConcentration.sharePct);
  if (delta === 0) return null;
  const assessment = numericMateriality(history, SECTOR_SHARE_POINT_THRESHOLD);
  const absolutePointMaterial = Math.abs(delta) >= SECTOR_SHARE_POINT_THRESHOLD;
  if (!assessment.material && !absolutePointMaterial) return null;
  return {
    id: stableSignalId("sector_concentration_change", newConcentration.sector ?? "unknown", previous.snapshotId, current.snapshotId),
    type: "sector_concentration_change",
    title: "Sector concentration changed",
    whatChanged: `The leading sector's share of known open pipeline changed by ${delta} percentage points.`,
    direction: delta >= 0 ? "increase" : "decrease",
    metric: "topSectorKnownOpenPipelineSharePct",
    oldValue: oldConcentration.sharePct,
    newValue: newConcentration.sharePct,
    delta,
    percentageDelta: percentageDelta(oldConcentration.sharePct, newConcentration.sharePct),
    timeWindow: { from: previous.capturedAt, to: current.capturedAt },
    method: absolutePointMaterial
      ? {
          name: "absolute_delta",
          description: "Top-sector known-open-pipeline share compared in percentage points between snapshots.",
          parameters: { materialPointThreshold: SECTOR_SHARE_POINT_THRESHOLD, leadingSector: newConcentration.sector },
        }
      : assessment.method,
    evidence: {
      dealItemIds: evidenceIds(current.deals.filter((deal) => !deal.malformed && isOpenDeal(deal) && deal.sector === newConcentration.sector)),
      workOrderItemIds: [],
    },
    dataCompleteness: completeness(
      current.deals.filter((deal) => !deal.malformed && isOpenDeal(deal) && deal.value !== null).length,
      current.deals.filter((deal) => !deal.malformed && isOpenDeal(deal) && deal.value === null).length,
      "Sector concentration uses known open Deal values only; unknown open values are excluded from the denominator and disclosed here.",
    ),
    sourceSnapshotIds: { from: previous.snapshotId, to: current.snapshotId },
    affected: { customer: null, sector: newConcentration.sector, entityId: null, entityName: newConcentration.sector },
  };
}

function billingCollectionSignal(
  previous: HistoricalBusinessSnapshot,
  current: HistoricalBusinessSnapshot,
): ChangeSignal | null {
  const oldHealth = calculateWorkOrderHealth(previous.workOrders, snapshotDate(previous));
  const newHealth = calculateWorkOrderHealth(current.workOrders, snapshotDate(current));
  const billedDelta = numericDelta(oldHealth.billedValueInclGst, newHealth.billedValueInclGst);
  const collectedDelta = numericDelta(oldHealth.collectedAmountInclGst, newHealth.collectedAmountInclGst);
  const receivablesDelta = numericDelta(oldHealth.receivables, newHealth.receivables);
  if (billedDelta - collectedDelta <= 0 || receivablesDelta <= 0) return null;
  const valid = current.workOrders.filter((workOrder) => !workOrder.malformed);
  const known = valid.filter(
    (workOrder) =>
      workOrder.billedValueInclGst !== null &&
      workOrder.collectedAmountInclGst !== null &&
      workOrder.amountReceivable !== null,
  ).length;
  return {
    id: stableSignalId("billing_collection_deterioration", "cash-conversion", previous.snapshotId, current.snapshotId),
    type: "billing_collection_deterioration",
    title: "Billing/collection posture deteriorated",
    whatChanged: "Billed value advanced faster than collections while receivables also increased.",
    direction: "deteriorated",
    metric: "receivables",
    oldValue: oldHealth.receivables,
    newValue: newHealth.receivables,
    delta: receivablesDelta,
    percentageDelta: percentageDelta(oldHealth.receivables, newHealth.receivables),
    timeWindow: { from: previous.capturedAt, to: current.capturedAt },
    method: {
      name: "absolute_delta",
      description: "Deterioration requires billed-value growth to exceed collection growth and receivables to increase in the same snapshot window.",
      parameters: { billedDelta, collectedDelta, receivablesDelta },
    },
    evidence: { dealItemIds: [], workOrderItemIds: evidenceIds(valid) },
    dataCompleteness: completeness(
      known,
      valid.length - known,
      "Cash-conversion comparison requires billed, collected and receivable fields; records missing any of those fields remain unknown.",
    ),
    sourceSnapshotIds: { from: previous.snapshotId, to: current.snapshotId },
    affected: { customer: null, sector: null, entityId: null, entityName: null },
  };
}

export function detectChangeIntelligence(inputSnapshots: HistoricalBusinessSnapshot[]): ChangeIntelligenceResult {
  const snapshots = uniqueChronologicalSnapshots(inputSnapshots);
  if (snapshots.length < 2) {
    return {
      snapshotCount: inputSnapshots.length,
      uniqueSnapshotCount: snapshots.length,
      fromSnapshotId: null,
      toSnapshotId: snapshots.at(-1)?.snapshotId ?? null,
      timeWindow: { from: null, to: snapshots.at(-1)?.capturedAt ?? null },
      signals: [],
      caveats: ["Change Detective needs at least two distinct historical snapshots. No synthetic comparison baseline is created."],
    };
  }

  const previous = snapshots[snapshots.length - 2];
  const current = snapshots[snapshots.length - 1];
  const previousPipeline = calculatePipelineMetrics(previous.deals);
  const currentPipeline = calculatePipelineMetrics(current.deals);
  const previousWorkOrders = calculateWorkOrderHealth(previous.workOrders, snapshotDate(previous));
  const currentWorkOrders = calculateWorkOrderHealth(current.workOrders, snapshotDate(current));
  const pipelineHistory = snapshots.map((snapshot) => calculatePipelineMetrics(snapshot.deals).openPipelineValue);
  const receivablesHistory = snapshots.map((snapshot) =>
    calculateWorkOrderHealth(snapshot.workOrders, snapshotDate(snapshot)).receivables,
  );

  const signals: ChangeSignal[] = [];
  const pipelineSignal = aggregateSignal(
    "open_pipeline_change",
    "Open pipeline changed materially",
    "knownOpenPipelineValue",
    pipelineHistory,
    previous,
    current,
    {
      dealItemIds: evidenceIds(current.deals.filter((deal) => !deal.malformed && isOpenDeal(deal))),
      workOrderItemIds: [],
    },
    completeness(
      currentPipeline.knownOpenValueDeals,
      currentPipeline.unknownOpenValueDeals,
      "Open pipeline sums known values only; open Deals with missing values remain excluded from the monetary total.",
    ),
  );
  if (pipelineSignal) signals.push(pipelineSignal);

  const receivablesSignal = aggregateSignal(
    "receivables_change",
    "Receivables changed materially",
    "knownReceivables",
    receivablesHistory,
    previous,
    current,
    {
      dealItemIds: [],
      workOrderItemIds: evidenceIds(current.workOrders.filter((workOrder) => !workOrder.malformed)),
    },
    completeness(
      currentWorkOrders.totalWorkOrders - currentWorkOrders.unknownReceivableCount,
      currentWorkOrders.unknownReceivableCount,
      "Receivables sum known Work Order receivable values only; missing receivable values remain explicit.",
    ),
  );
  if (receivablesSignal) signals.push(receivablesSignal);

  signals.push(...compareDealTransitions(previous, current));
  signals.push(...compareWorkOrderTransitions(previous, current));
  const billingSignal = billingCollectionSignal(previous, current);
  if (billingSignal) signals.push(billingSignal);
  signals.push(...customerExposureSignals(snapshots, previous, current));
  const concentrationSignal = sectorConcentrationSignal(snapshots, previous, current);
  if (concentrationSignal) signals.push(concentrationSignal);

  const orderIndex = new Map(SIGNAL_ORDER.map((type, index) => [type, index]));
  signals.sort(
    (a, b) =>
      (orderIndex.get(a.type) ?? SIGNAL_ORDER.length) - (orderIndex.get(b.type) ?? SIGNAL_ORDER.length) ||
      (a.affected.customer ?? a.affected.sector ?? a.affected.entityName ?? "").localeCompare(
        b.affected.customer ?? b.affected.sector ?? b.affected.entityName ?? "",
      ) ||
      a.id.localeCompare(b.id),
  );

  const caveats: string[] = [];
  if (inputSnapshots.length !== snapshots.length) {
    caveats.push(`${inputSnapshots.length - snapshots.length} duplicated snapshot reference(s) were ignored by snapshotId.`);
  }
  if (snapshots.length < 5) {
    caveats.push("History is sparse; robust rolling baselines activate only when enough prior snapshot deltas exist. Sparse comparisons use explicit percentage/event thresholds.");
  }
  caveats.push("Change Detective is deterministic/statistical decision support. It does not produce predictive probabilities or opaque AI risk scores.");

  return {
    snapshotCount: inputSnapshots.length,
    uniqueSnapshotCount: snapshots.length,
    fromSnapshotId: previous.snapshotId,
    toSnapshotId: current.snapshotId,
    timeWindow: { from: previous.capturedAt, to: current.capturedAt },
    signals,
    caveats,
  };
}
