import type { BusinessDataSnapshot } from "@/lib/business-data";
import type { DataServingMode, TemporalSnapshotStore } from "./contracts";

export interface ServingCoreOptions {
  mode: DataServingMode;
  store: TemporalSnapshotStore;
  liveLoader: () => Promise<BusinessDataSnapshot>;
  workspaceKey: string;
  now: Date;
  staleAfterMs: number;
}

export async function loadBusinessDataFromTemporalStore(options: ServingCoreOptions): Promise<BusinessDataSnapshot> {
  if (options.mode === "live") return options.liveLoader();

  try {
    const stored = await options.store.loadLatestSuccessfulSnapshot(options.workspaceKey);
    if (stored) {
      const freshness = await options.store.getFreshness({
        workspaceKey: options.workspaceKey,
        now: options.now.toISOString(),
        staleAfterMs: options.staleAfterMs,
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
    if (options.mode === "temporal_only") throw error;
  }

  if (options.mode === "temporal_only") {
    throw new Error("No successful temporal snapshot is available for analytics.");
  }
  return options.liveLoader();
}
