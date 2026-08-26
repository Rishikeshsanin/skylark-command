import "server-only";

import { loadLiveBusinessData, type BusinessDataSnapshot } from "@/lib/business-data";
import type { TemporalSnapshotStore } from "./contracts";
import { instrumentTemporalSnapshotStore } from "./instrumented-store";
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
  const workspaceKey = options.workspaceKey ?? process.env.SKYLARK_WORKSPACE_KEY?.trim() ?? DEFAULT_WORKSPACE_KEY;
  const store = instrumentTemporalSnapshotStore(
    options.store ?? createPostgresTemporalSnapshotStore(),
    workspaceKey,
  );
  return runBusinessDataSyncCore({
    store,
    liveLoader: options.liveLoader ?? (() => loadLiveBusinessData()),
    workspaceKey,
    now: options.now,
    createId: options.createId,
    staleAfterMs: options.staleAfterMs,
  });
}
