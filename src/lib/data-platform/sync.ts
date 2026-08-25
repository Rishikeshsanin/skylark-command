import "server-only";

import { randomUUID } from "node:crypto";
import { loadLiveBusinessData, type BusinessDataSnapshot } from "@/lib/business-data";
import type { TemporalFreshness, TemporalSnapshotStore } from "./contracts";
import { createPostgresTemporalSnapshotStore } from "./postgres";
import { calculateSourceWatermark } from "./watermark";

const DEFAULT_WORKSPACE_KEY = "skylark-command";
const DEFAULT_STALE_AFTER_MS = 60 * 60 * 1000;
const MAX_ERROR_CHARS = 1_000;

export interface SyncResult {
  syncId: string;
  snapshotId: string;
  sourceWatermark: string;
  recordsFetched: number;
  recordsNormalized: number;
  recordsPersisted: number;
  reusedExistingSnapshot: boolean;
  freshness: TemporalFreshness;
}

interface RunSyncOptions {
  store?: TemporalSnapshotStore;
  liveLoader?: () => Promise<BusinessDataSnapshot>;
  workspaceKey?: string;
  now?: () => Date;
  createId?: () => string;
  staleAfterMs?: number;
}

function safeSyncError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown synchronization failure.";
  return message.replace(/[\r\n]+/g, " ").slice(0, MAX_ERROR_CHARS);
}

export async function runBusinessDataSync(options: RunSyncOptions = {}): Promise<SyncResult> {
  const store = options.store ?? createPostgresTemporalSnapshotStore();
  const liveLoader = options.liveLoader ?? (() => loadLiveBusinessData());
  const workspaceKey = options.workspaceKey ?? process.env.SKYLARK_WORKSPACE_KEY?.trim() ?? DEFAULT_WORKSPACE_KEY;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const syncId = createId();
  const startedAt = now().toISOString();

  await store.beginSync({ syncId, workspaceKey, startedAt });

  try {
    const snapshot = await liveLoader();
    const sourceWatermark = calculateSourceWatermark(snapshot);
    const snapshotId = createId();
    const recordsFetched = snapshot.deals.length + snapshot.workOrders.length;
    const recordsNormalized = recordsFetched;
    const persisted = await store.persistSnapshot({
      workspaceKey,
      snapshotId,
      snapshotTime: now().toISOString(),
      sourceWatermark,
      snapshot,
    });
    const finishedAt = now().toISOString();

    await store.completeSync({
      syncId,
      finishedAt,
      recordsFetched,
      recordsNormalized,
      recordsPersisted: persisted.recordsPersisted,
      sourceWatermark,
      snapshotId: persisted.snapshotId,
    });

    const freshness = await store.getFreshness({
      workspaceKey,
      now: finishedAt,
      staleAfterMs,
    });

    return {
      syncId,
      snapshotId: persisted.snapshotId,
      sourceWatermark,
      recordsFetched,
      recordsNormalized,
      recordsPersisted: persisted.recordsPersisted,
      reusedExistingSnapshot: persisted.reusedExistingSnapshot,
      freshness,
    };
  } catch (error) {
    await store.failSync({
      syncId,
      finishedAt: now().toISOString(),
      error: safeSyncError(error),
    });
    throw error;
  }
}
