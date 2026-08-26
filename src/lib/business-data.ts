import type { DataQualityIssue, Deal, WorkOrder } from "../types";
import { fetchSkylarkSourceBoards } from "./monday";
import type { MondayClientOptions } from "./monday";
import { normalizeDeals, normalizeWorkOrders } from "./normalization";

export interface BusinessDataSnapshot {
  deals: Deal[];
  workOrders: WorkOrder[];
  normalizationIssues: DataQualityIssue[];
  source: {
    provider: "monday.com";
    dealsBoardId: string;
    workOrdersBoardId: string;
    dealsBoardName: string;
    workOrdersBoardName: string;
    fetchedAt: string;
    dataMode?: "live" | "temporal";
    freshnessState?: "fresh" | "stale" | "syncing" | "failed";
    lastSyncStartedAt?: string | null;
    lastSyncSucceededAt?: string | null;
    sourceWatermark?: string | null;
    servedSnapshotAt?: string | null;
  };
}

/** Fetches and normalizes the current monday.com source-of-truth rows. */
export async function loadLiveBusinessData(options?: MondayClientOptions): Promise<BusinessDataSnapshot> {
  const source = await fetchSkylarkSourceBoards(options);
  const deals = normalizeDeals(source.deals.items);
  const workOrders = normalizeWorkOrders(source.workOrders.items);

  return {
    deals: deals.records,
    workOrders: workOrders.records,
    normalizationIssues: [...deals.issues, ...workOrders.issues],
    source: {
      provider: "monday.com",
      dealsBoardId: source.deals.boardId,
      workOrdersBoardId: source.workOrders.boardId,
      dealsBoardName: source.deals.boardName,
      workOrdersBoardName: source.workOrders.boardName,
      fetchedAt: new Date().toISOString(),
      dataMode: "live",
    },
  };
}

/**
 * Canonical analytics loader. `SKYLARK_DATA_MODE=live` preserves V1 exactly;
 * temporal modes are resolved lazily so the live source adapter stays isolated.
 */
export async function loadBusinessData(options?: MondayClientOptions): Promise<BusinessDataSnapshot> {
  const mode = process.env.SKYLARK_DATA_MODE;
  if (mode !== "temporal_preferred" && mode !== "temporal_only") {
    return loadLiveBusinessData(options);
  }

  const { loadBusinessDataForAnalytics } = await import("./data-platform/serving");
  return loadBusinessDataForAnalytics({
    mode,
    liveLoader: () => loadLiveBusinessData(options),
  });
}
