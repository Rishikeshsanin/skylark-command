import "server-only";

import { loadLiveBusinessData, type BusinessDataSnapshot } from "@/lib/business-data";
import type { TemporalSnapshotStore } from "./contracts";
import { createPostgresTemporalSnapshotStore } from "./postgres";
import {
  runBusinessDataSyncCore,
  type SyncResult,
} from "./sync-core";

const DEFAULT_WORKSPACE_KEY = "skylark-command";

interface RunSyncOptions {
  store?: TemporalSnapshotStore;
  liveLoader?: () => Promise<BusinessDataSnapshot>;
  workspaceKey?: string;
  now?: () => Date;
  createId?: () => string;
  staleAfterMs?: number;
}

export type { SyncResult } from "./sync-core";

export function runBusinessDataSync(options: RunSyncOptions = {}): Promise<SyncResult> {
  return runBusinessDataSyncCore({
    store: options.store ?? createPostgresTemporalSnapshotStore(),
    liveLoader: options.liveLoader ?? (() => loadLiveBusinessData()),
    workspaceKey: options.workspaceKey ?? process.env.SKYLARK_WORKSPACE_KEY?.trim() ?? DEFAULT_WORKSPACE_KEY,
    now: options.now,
    createId: options.createId,
    staleAfterMs: options.staleAfterMs,
  });
}
