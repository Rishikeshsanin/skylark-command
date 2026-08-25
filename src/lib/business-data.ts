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
  };
}

/** Fetches current monday.com rows and normalizes them; no source data is cached or embedded. */
export async function loadBusinessData(options?: MondayClientOptions): Promise<BusinessDataSnapshot> {
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
    },
  };
}
