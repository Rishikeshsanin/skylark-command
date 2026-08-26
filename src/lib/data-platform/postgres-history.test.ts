import { describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { PostgresTemporalSnapshotStore } from "./postgres";
import type { Deal, WorkOrder } from "@/types";

const deal = {
  mondayItemId: "deal-1",
  name: "Deal",
  sourceRow: 1,
  malformed: false,
  sourceQualityFlags: [],
  status: "Open",
  stage: "Qualified",
  value: null,
  sector: "Mining",
  clientCode: "COMPANY001",
  normalizedClientKey: "COMPANY001",
  createdDate: null,
  closeDate: null,
  tentativeCloseDate: null,
  closureProbability: null,
} as Deal;

const workOrder = {
  mondayItemId: "wo-1",
  name: "WO",
  sourceRow: 1,
  malformed: false,
  sourceQualityFlags: [],
  customerCode: "WOCOMPANY_001",
  normalizedClientKey: "COMPANY001",
  executionStatus: "Ongoing",
  probableStartDate: null,
  probableEndDate: null,
  billingStatus: null,
  collectionStatus: null,
  invoiceStatus: null,
  latestInvoiceNumber: null,
  lastInvoiceDate: null,
  amountInclGst: null,
  billedValueInclGst: null,
  collectedAmountInclGst: null,
  amountReceivable: null,
  amountToBeBilledInclGst: null,
  arPriority: null,
} as WorkOrder;

describe("Postgres temporal history enumeration", () => {
  it("queries only successful workspace snapshots with deterministic bounds and preserves payload nulls", async () => {
    const calls: Array<{ text: string; values: unknown[] }> = [];
    const fakeSql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      calls.push({ text, values });
      if (text.includes("FROM analytical_snapshots s")) {
        return [{
          id: "snapshot-1",
          workspace_key: "workspace-a",
          snapshot_time: "2026-08-25T10:05:00.000Z",
          source_fetched_at: "2026-08-25T10:00:00.000Z",
          source_watermark: `sha256:${"a".repeat(64)}`,
          source_metadata: {
            provider: "monday.com",
            dealsBoardId: "1",
            workOrdersBoardId: "2",
            dealsBoardName: "Deals",
            workOrdersBoardName: "Work Orders",
            fetchedAt: "2026-08-25T10:00:00.000Z",
            dataMode: "temporal",
          },
          normalization_issues: [],
        }];
      }
      if (text.includes("FROM deal_snapshots")) return [{ normalized_payload: deal }];
      if (text.includes("FROM work_order_snapshots")) return [{ normalized_payload: workOrder }];
      return [];
    }) as unknown as Sql;

    const store = new PostgresTemporalSnapshotStore(fakeSql);
    const [snapshot] = await store.listSuccessfulSnapshots({
      workspaceKey: "workspace-a",
      fromSnapshotTime: "2026-08-20T00:00:00Z",
      toSnapshotTime: "2026-08-26T00:00:00Z",
      limit: 7,
      order: "desc",
    });

    const enumeration = calls[0];
    expect(enumeration.text).toContain("s.workspace_key =");
    expect(enumeration.text).toContain("r.workspace_key =");
    expect(enumeration.text).toContain("r.status = 'succeeded'");
    expect(enumeration.text).toContain("r.snapshot_id = s.id");
    expect(enumeration.text).toContain("ORDER BY s.snapshot_time DESC, s.id DESC");
    expect(enumeration.text).toContain("LIMIT");
    expect(enumeration.values).toContain("workspace-a");
    expect(enumeration.values).toContain(7);
    expect(snapshot.temporal.snapshotId).toBe("snapshot-1");
    expect(snapshot.source.fetchedAt).toBe("2026-08-25T10:00:00.000Z");
    expect(snapshot.temporal.sourceWatermark).toMatch(/^sha256:/);
    expect(snapshot.deals[0].value).toBeNull();
    expect(snapshot.workOrders[0].amountReceivable).toBeNull();
  });
});
