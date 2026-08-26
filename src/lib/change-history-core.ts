import type { BusinessDataSnapshot } from "@/lib/business-data";
import type {
  HistoricalSnapshotOrder,
  StoredBusinessDataSnapshot,
  TemporalSnapshotStore,
} from "@/lib/data-platform/contracts";
import type { HistoricalBusinessSnapshot } from "@/types";

const DEFAULT_WORKSPACE_KEY = "skylark-command";

export interface HistoricalSnapshotQuery {
  fromSnapshotTime?: string;
  toSnapshotTime?: string;
  limit?: number;
  order?: HistoricalSnapshotOrder;
}

export interface HistoricalSnapshotProvider {
  listSnapshots(query?: HistoricalSnapshotQuery): Promise<HistoricalBusinessSnapshot[]>;
}

export function toHistoricalBusinessSnapshot(
  snapshot: BusinessDataSnapshot | StoredBusinessDataSnapshot,
  snapshotId?: string,
): HistoricalBusinessSnapshot {
  const temporal = "temporal" in snapshot ? snapshot.temporal : null;
  return {
    snapshotId: snapshotId ?? temporal?.snapshotId ?? `live:${snapshot.source.fetchedAt}`,
    capturedAt: temporal?.snapshotTime ?? snapshot.source.fetchedAt,
    deals: snapshot.deals,
    workOrders: snapshot.workOrders,
    normalizationIssues: snapshot.normalizationIssues,
  };
}

export function createTemporalHistoricalSnapshotProvider(
  store: TemporalSnapshotStore,
  workspaceKey = DEFAULT_WORKSPACE_KEY,
): HistoricalSnapshotProvider {
  return {
    async listSnapshots(query = {}) {
      const stored = await store.listSuccessfulSnapshots({
        workspaceKey,
        fromSnapshotTime: query.fromSnapshotTime,
        toSnapshotTime: query.toSnapshotTime,
        limit: query.limit,
        order: query.order,
      });
      return stored.map((snapshot) => toHistoricalBusinessSnapshot(snapshot));
    },
  };
}
