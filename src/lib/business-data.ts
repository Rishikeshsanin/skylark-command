import type { DataQualityIssue, Deal, WorkOrder } from "../types";
import { PublicApiError } from "./server/errors";
import { currentWorkspaceDataScope } from "./data-platform/workspace-scope";
import { fetchSkylarkSourceBoards } from "./monday";
import type { MondayClientOptions } from "./monday";
import { normalizeDeals, normalizeWorkOrders } from "./normalization";
import { observeOperation, observeSyncOperation } from "./server/telemetry";

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
  return observeOperation("business_data.live_load", { operation: "business_data_live_load", provider: "monday.com" }, async () => {
    const source = await observeOperation(
      "monday.fetch",
      { operation: "monday_fetch", provider: "monday.com" },
      () => fetchSkylarkSourceBoards(options),
    );
    const deals = observeSyncOperation(
      "normalization.deals",
      { operation: "normalize_deals" },
      () => normalizeDeals(source.deals.items),
    );
    const workOrders = observeSyncOperation(
      "normalization.work_orders",
      { operation: "normalize_work_orders" },
      () => normalizeWorkOrders(source.workOrders.items),
    );

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
  });
}

/**
 * Canonical analytics loader. Public demo preserves live/default behavior.
 * Authenticated workspace reads fail closed unless temporal storage is enabled,
 * because the legacy live connector is intentionally a single public-demo source.
 */
export async function loadBusinessData(options?: MondayClientOptions): Promise<BusinessDataSnapshot> {
  return observeOperation("business_data.load", { operation: "business_data_load" }, async () => {
    const mode = process.env.SKYLARK_DATA_MODE;
    const workspaceKey = currentWorkspaceDataScope();
    if (mode !== "temporal_preferred" && mode !== "temporal_only") {
      if (workspaceKey) {
        throw new PublicApiError(
          503,
          "WORKSPACE_DATA_NOT_CONFIGURED",
          "Workspace analytics require isolated temporal data serving.",
        );
      }
      return loadLiveBusinessData(options);
    }

    const { loadBusinessDataForAnalytics } = await import("./data-platform/serving");
    return loadBusinessDataForAnalytics({
      mode,
      liveLoader: () => loadLiveBusinessData(options),
      ...(workspaceKey ? { workspaceKey } : {}),
    });
  });
}
