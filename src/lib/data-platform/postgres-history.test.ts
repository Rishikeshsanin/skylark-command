import { describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { makeDeal, makeWorkOrder } from "../../../tests/fixtures";
import {
  PostgresTemporalSnapshotStore,
  resolveTemporalMaxConnections,
} from "./postgres";

const deal = makeDeal({
  mondayItemId: "deal-1",
  normalizedClientKey: "COMPANY001",
  value: null,
});
const workOrder = makeWorkOrder({
  mondayItemId: "wo-1",
  normalizedClientKey: "COMPANY001",
  amountReceivable: null,
});

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

  it("defaults to one serverless database connection and clamps overrides", () => {
    expect(resolveTemporalMaxConnections(undefined)).toBe(1);
    expect(resolveTemporalMaxConnections("2")).toBe(2);
    expect(resolveTemporalMaxConnections("99")).toBe(5);
    expect(resolveTemporalMaxConnections("0")).toBe(1);
    expect(resolveTemporalMaxConnections("not-a-number")).toBe(1);
  });
});
