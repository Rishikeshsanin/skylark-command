import type { BusinessDataSnapshot } from "@/lib/business-data";

export type SyncRunStatus = "syncing" | "succeeded" | "failed";
export type FreshnessState = "fresh" | "stale" | "syncing" | "failed";
export type DataServingMode = "live" | "temporal_preferred" | "temporal_only";
export type HistoricalSnapshotOrder = "asc" | "desc";

export interface SyncRunRecord {
  id: string;
  workspaceKey: string;
  sourceProvider: "monday.com";
  startedAt: string;
  finishedAt: string | null;
  status: SyncRunStatus;
  recordsFetched: number;
  recordsNormalized: number;
  recordsPersisted: number;
  error: string | null;
  sourceWatermark: string | null;
  snapshotId: string | null;
}

export interface TemporalFreshness {
  state: FreshnessState;
  lastSyncStartedAt: string | null;
  lastSyncSucceededAt: string | null;
  sourceWatermark: string | null;
  servedSnapshotAt: string | null;
}

export interface PersistSnapshotInput {
  workspaceKey: string;
  snapshotId: string;
  snapshotTime: string;
  sourceWatermark: string;
  snapshot: BusinessDataSnapshot;
}

export interface PersistSnapshotResult {
  snapshotId: string;
  recordsPersisted: number;
  reusedExistingSnapshot: boolean;
}

export interface StoredBusinessDataSnapshot extends BusinessDataSnapshot {
  temporal: {
    snapshotId: string;
    snapshotTime: string;
    sourceWatermark: string;
  };
}

export interface ListSuccessfulSnapshotsInput {
  workspaceKey: string;
  fromSnapshotTime?: string;
  toSnapshotTime?: string;
  limit?: number;
  order?: HistoricalSnapshotOrder;
}

export interface TemporalSnapshotStore {
  beginSync(input: {
    syncId: string;
    workspaceKey: string;
    startedAt: string;
  }): Promise<SyncRunRecord>;

  persistSnapshot(input: PersistSnapshotInput): Promise<PersistSnapshotResult>;

  completeSync(input: {
    syncId: string;
    finishedAt: string;
    recordsFetched: number;
    recordsNormalized: number;
    recordsPersisted: number;
    sourceWatermark: string;
    snapshotId: string;
  }): Promise<SyncRunRecord>;

  failSync(input: {
    syncId: string;
    finishedAt: string;
    error: string;
  }): Promise<SyncRunRecord>;

  loadLatestSuccessfulSnapshot(workspaceKey: string): Promise<StoredBusinessDataSnapshot | null>;

  /** Enumerates only persisted analytical snapshots referenced by at least one successful sync run. */
  listSuccessfulSnapshots(input: ListSuccessfulSnapshotsInput): Promise<StoredBusinessDataSnapshot[]>;

  getFreshness(input: {
    workspaceKey: string;
    now: string;
    staleAfterMs: number;
  }): Promise<TemporalFreshness>;
}
