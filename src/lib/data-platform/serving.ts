import "server-only";

import { loadLiveBusinessData, type BusinessDataSnapshot } from "@/lib/business-data";
import type { DataServingMode, TemporalSnapshotStore } from "./contracts";
import { createPostgresTemporalSnapshotStore } from "./postgres";

const DEFAULT_WORKSPACE_KEY = "skylark-command";
const DEFAULT_STALE_AFTER_MINUTES = 60;

interface ServingOptions {
  mode?: DataServingMode;
  store?: TemporalSnapshotStore;
  liveLoader?: () => Promise<BusinessDataSnapshot>;
  workspaceKey?: string;
  now?: Date;
  staleAfterMs?: number;
}

export function resolveDataServingMode(value = process.env.SKYLARK_DATA_MODE): DataServingMode {
  if (value === "temporal_preferred" || value === "temporal_only") return value;
  return "live";
}

function staleAfterMsFromEnvironment(): number {
  const configured = Number(process.env.SKYLARK_STALE_AFTER_MINUTES);
  const minutes = Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_STALE_AFTER_MINUTES;
  return minutes * 60 * 1000;
}

export async function loadBusinessDataForAnalytics(options: ServingOptions = {}): Promise<BusinessDataSnapshot> {
  const mode = options.mode ?? resolveDataServingMode();
  const liveLoader = options.liveLoader ?? (() => loadLiveBusinessData());

  if (mode === "live") return liveLoader();

  const workspaceKey = options.workspaceKey ?? process.env.SKYLARK_WORKSPACE_KEY?.trim() ?? DEFAULT_WORKSPACE_KEY;
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? staleAfterMsFromEnvironment();

  try {
    const store = options.store ?? createPostgresTemporalSnapshotStore();
    const stored = await store.loadLatestSuccessfulSnapshot(workspaceKey);

    if (stored) {
      const freshness = await store.getFreshness({
        workspaceKey,
        now: now.toISOString(),
        staleAfterMs,
      });
      return {
        deals: stored.deals,
        workOrders: stored.workOrders,
        normalizationIssues: stored.normalizationIssues,
        source: {
          ...stored.source,
          dataMode: "temporal",
          freshnessState: freshness.state,
          lastSyncStartedAt: freshness.lastSyncStartedAt,
          lastSyncSucceededAt: freshness.lastSyncSucceededAt,
          sourceWatermark: freshness.sourceWatermark ?? stored.temporal.sourceWatermark,
          servedSnapshotAt: freshness.servedSnapshotAt ?? stored.temporal.snapshotTime,
        },
      };
    }
  } catch (error) {
    if (mode === "temporal_only") throw error;
  }

  if (mode === "temporal_only") {
    throw new Error("No successful temporal snapshot is available for analytics.");
  }

  return liveLoader();
}
