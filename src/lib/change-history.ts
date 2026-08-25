import type { HistoricalBusinessSnapshot } from "@/types";
import {
  loadBusinessData,
  type BusinessDataSnapshot,
} from "@/lib/business-data";

export interface HistoricalSnapshotProvider {
  listSnapshots(): Promise<HistoricalBusinessSnapshot[]>;
}

export function toHistoricalBusinessSnapshot(
  snapshot: BusinessDataSnapshot,
  snapshotId = `live:${snapshot.source.fetchedAt}`,
): HistoricalBusinessSnapshot {
  return {
    snapshotId,
    capturedAt: snapshot.source.fetchedAt,
    deals: snapshot.deals,
    workOrders: snapshot.workOrders,
    normalizationIssues: snapshot.normalizationIssues,
  };
}

/**
 * Integration seam for Agent 1's persisted historical snapshot store.
 * Until a provider is injected, V2 uses only the current live snapshot and
 * Change Detective explicitly reports sparse history rather than inventing it.
 */
export async function loadAvailableChangeSnapshots(
  provider?: HistoricalSnapshotProvider,
): Promise<HistoricalBusinessSnapshot[]> {
  if (provider) return provider.listSnapshots();
  const current = await loadBusinessData();
  return [toHistoricalBusinessSnapshot(current)];
}
