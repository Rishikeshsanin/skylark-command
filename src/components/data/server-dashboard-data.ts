import { loadBusinessData } from "@/lib/business-data";
import {
  loadAvailableChangeSnapshots,
  type HistoricalSnapshotProvider,
} from "@/lib/change-history";
import {
  buildClientIntelligence,
  buildCustomer360,
  buildDataQualityReport,
  buildLeadershipBriefData,
  calculatePipelineMetrics,
  calculateSectorMetrics,
  calculateWorkOrderHealth,
  dealCloseQuarterMetrics,
  detectChangeIntelligence,
  findRiskyDeals,
  getFounderAttentionFeed,
  largestDeals,
  pipelineByStage,
} from "@/lib/analytics";

export async function loadSafely<T>(loader: () => Promise<T>, errorMessage: string): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await loader(), error: null };
  } catch {
    return { data: null, error: errorMessage };
  }
}

function analysisDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function loadExecutiveViewData() {
  const snapshot = await loadBusinessData();
  const asOfDate = analysisDate();
  const pipeline = calculatePipelineMetrics(snapshot.deals);
  const workOrders = calculateWorkOrderHealth(snapshot.workOrders, asOfDate);
  const sectors = calculateSectorMetrics(snapshot.deals, snapshot.workOrders);
  const clients = buildClientIntelligence(snapshot.deals, snapshot.workOrders, asOfDate);
  const dataQuality = buildDataQualityReport(snapshot.deals, snapshot.workOrders, snapshot.normalizationIssues, asOfDate);
  const attention = getFounderAttentionFeed(snapshot.deals, snapshot.workOrders, asOfDate);

  return { snapshot, asOfDate, pipeline, workOrders, sectors, clients, dataQuality, attention };
}

export async function loadPipelineViewData() {
  const snapshot = await loadBusinessData();
  const asOfDate = analysisDate();
  return {
    snapshot,
    metrics: calculatePipelineMetrics(snapshot.deals),
    stages: pipelineByStage(snapshot.deals, true),
    sectors: calculateSectorMetrics(snapshot.deals, snapshot.workOrders),
    risks: findRiskyDeals(snapshot.deals, asOfDate),
    largestDeals: largestDeals(snapshot.deals, 10, true),
    quarters: dealCloseQuarterMetrics(snapshot.deals, true),
  };
}

export async function loadOperationsViewData() {
  const snapshot = await loadBusinessData();
  const asOfDate = analysisDate();
  return { snapshot, health: calculateWorkOrderHealth(snapshot.workOrders, asOfDate), sectors: calculateSectorMetrics(snapshot.deals, snapshot.workOrders) };
}

export async function loadLeadershipViewData() {
  const snapshot = await loadBusinessData();
  const asOfDate = analysisDate();
  return { snapshot, brief: buildLeadershipBriefData(snapshot.deals, snapshot.workOrders, asOfDate, snapshot.normalizationIssues) };
}

export async function loadDataHealthViewData() {
  const snapshot = await loadBusinessData();
  const asOfDate = analysisDate();
  return { snapshot, report: buildDataQualityReport(snapshot.deals, snapshot.workOrders, snapshot.normalizationIssues, asOfDate) };
}

export async function loadChangeIntelligenceViewData(
  provider?: HistoricalSnapshotProvider,
) {
  const snapshots = await loadAvailableChangeSnapshots(provider);
  return {
    snapshots,
    latestSnapshot: snapshots.at(-1) ?? null,
    changes: detectChangeIntelligence(snapshots),
  };
}

export async function loadCustomer360ViewData(
  normalizedClientKey: string,
  provider?: HistoricalSnapshotProvider,
) {
  const snapshots = await loadAvailableChangeSnapshots(provider);
  const latestSnapshot = snapshots.at(-1);
  if (!latestSnapshot) {
    return { snapshots, latestSnapshot: null, changes: detectChangeIntelligence([]), customer: null };
  }
  const asOfDate = latestSnapshot.capturedAt.slice(0, 10);
  const changes = detectChangeIntelligence(snapshots);
  const attention = getFounderAttentionFeed(
    latestSnapshot.deals,
    latestSnapshot.workOrders,
    asOfDate,
  );
  const customer = buildCustomer360(
    normalizedClientKey,
    latestSnapshot,
    snapshots,
    attention,
    changes.signals,
  );
  return { snapshots, latestSnapshot, changes, customer };
}
