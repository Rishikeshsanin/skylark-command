import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredHistoricalSnapshotProvider } from "@/lib/change-history";
import { createTemporalHistoricalSnapshotProvider } from "@/lib/change-history-core";
import { buildCustomer360, detectChangeIntelligence } from "@/lib/analytics";
import type {
  ListSuccessfulSnapshotsInput,
  StoredBusinessDataSnapshot,
  TemporalSnapshotStore,
} from "@/lib/data-platform/contracts";
import { normalizeSuccessfulSnapshotQuery } from "@/lib/data-platform/history-query";
import { makeDeal, makeWorkOrder } from "./fixtures";

function storedSnapshot(input: {
  id: string;
  snapshotTime: string;
  fetchedAt?: string;
  watermark?: string;
  dealValue?: number | null;
  receivable?: number | null;
}): StoredBusinessDataSnapshot {
  const dealValue = input.dealValue === undefined ? 100 : input.dealValue;
  const receivable = input.receivable === undefined ? 10 : input.receivable;
  return {
    deals: [makeDeal({ mondayItemId: "deal-1", normalizedClientKey: "COMPANY001", status: "Open", value: dealValue })],
    workOrders: [makeWorkOrder({ mondayItemId: "wo-1", normalizedClientKey: "COMPANY001", amountReceivable: receivable })],
    normalizationIssues: [],
    source: {
      provider: "monday.com",
      dealsBoardId: "5030844099",
      workOrdersBoardId: "5030844103",
      dealsBoardName: "Deals",
      workOrdersBoardName: "Work Orders",
      fetchedAt: input.fetchedAt ?? input.snapshotTime,
      dataMode: "temporal",
    },
    temporal: {
      snapshotId: input.id,
      snapshotTime: input.snapshotTime,
      sourceWatermark: input.watermark ?? `sha256:${input.id.padEnd(64, "0").slice(0, 64)}`,
    },
  };
}

function historyStore(snapshots: StoredBusinessDataSnapshot[]): TemporalSnapshotStore {
  return {
    beginSync: async () => { throw new Error("not used"); },
    persistSnapshot: async () => { throw new Error("not used"); },
    completeSync: async () => { throw new Error("not used"); },
    failSync: async () => { throw new Error("not used"); },
    loadLatestSuccessfulSnapshot: async () => snapshots.at(-1) ?? null,
    async listSuccessfulSnapshots(input: ListSuccessfulSnapshotsInput) {
      const query = normalizeSuccessfulSnapshotQuery(input);
      return snapshots
        .filter((snapshot) => !query.fromSnapshotTime || Date.parse(snapshot.temporal.snapshotTime) >= Date.parse(query.fromSnapshotTime))
        .filter((snapshot) => !query.toSnapshotTime || Date.parse(snapshot.temporal.snapshotTime) <= Date.parse(query.toSnapshotTime))
        .sort((a, b) => {
          const delta = Date.parse(a.temporal.snapshotTime) - Date.parse(b.temporal.snapshotTime)
            || a.temporal.snapshotId.localeCompare(b.temporal.snapshotId);
          return query.order === "asc" ? delta : -delta;
        })
        .slice(0, query.limit);
    },
    getFreshness: async () => ({
      state: "fresh",
      lastSyncStartedAt: null,
      lastSyncSucceededAt: null,
      sourceWatermark: snapshots.at(-1)?.temporal.sourceWatermark ?? null,
      servedSnapshotAt: snapshots.at(-1)?.temporal.snapshotTime ?? null,
    }),
  };
}

test("history query normalizes ranges and caps result limits", () => {
  const query = normalizeSuccessfulSnapshotQuery({
    workspaceKey: "  skylark-command  ",
    fromSnapshotTime: "2026-08-20T10:00:00Z",
    toSnapshotTime: "2026-08-25T10:00:00Z",
    limit: 999,
    order: "desc",
  });
  assert.equal(query.workspaceKey, "skylark-command");
  assert.equal(query.limit, 100);
  assert.equal(query.order, "desc");
  assert.equal(query.fromSnapshotTime, "2026-08-20T10:00:00.000Z");
  assert.throws(() => normalizeSuccessfulSnapshotQuery({
    workspaceKey: "skylark-command",
    fromSnapshotTime: "2026-08-26T00:00:00Z",
    toSnapshotTime: "2026-08-25T00:00:00Z",
  }), /fromSnapshotTime/);
});

test("temporal provider preserves persisted IDs, timestamps and chronology", async () => {
  const early = storedSnapshot({ id: "snapshot-a", snapshotTime: "2026-08-24T10:05:00Z", fetchedAt: "2026-08-24T10:00:00Z", watermark: `sha256:${"a".repeat(64)}` });
  const late = storedSnapshot({ id: "snapshot-b", snapshotTime: "2026-08-25T10:05:00Z", fetchedAt: "2026-08-25T10:00:00Z", watermark: `sha256:${"b".repeat(64)}` });
  const result = await createTemporalHistoricalSnapshotProvider(historyStore([early, late])).listSnapshots({ order: "asc", limit: 10 });
  assert.deepEqual(result.map((item) => item.snapshotId), ["snapshot-a", "snapshot-b"]);
  assert.deepEqual(result.map((item) => item.capturedAt), [early.temporal.snapshotTime, late.temporal.snapshotTime]);
  assert.equal(early.source.fetchedAt, "2026-08-24T10:00:00Z");
  assert.equal(early.temporal.sourceWatermark, `sha256:${"a".repeat(64)}`);
});

test("persisted history drives deterministic Change Detective evidence", async () => {
  const before = storedSnapshot({ id: "before", snapshotTime: "2026-08-24T10:05:00Z", dealValue: 100, receivable: 10 });
  const after = storedSnapshot({ id: "after", snapshotTime: "2026-08-25T10:05:00Z", dealValue: 150, receivable: 20 });
  const history = await createTemporalHistoricalSnapshotProvider(historyStore([before, after])).listSnapshots({ order: "asc" });
  const changes = detectChangeIntelligence(history);
  const pipeline = changes.signals.find((signal) => signal.type === "open_pipeline_change");
  const receivables = changes.signals.find((signal) => signal.type === "receivables_change");
  assert.ok(pipeline);
  assert.equal(pipeline.delta, 50);
  assert.deepEqual(pipeline.evidence.dealItemIds, ["deal-1"]);
  assert.deepEqual(pipeline.sourceSnapshotIds, { from: "before", to: "after" });
  assert.ok(receivables);
  assert.deepEqual(receivables.evidence.workOrderItemIds, ["wo-1"]);
});

test("persisted history populates Customer 360 history", async () => {
  const before = storedSnapshot({ id: "before", snapshotTime: "2026-08-24T10:05:00Z", dealValue: 100, receivable: 10 });
  const after = storedSnapshot({ id: "after", snapshotTime: "2026-08-25T10:05:00Z", dealValue: 175, receivable: 30 });
  const history = await createTemporalHistoricalSnapshotProvider(historyStore([before, after])).listSnapshots({ order: "asc" });
  const changes = detectChangeIntelligence(history);
  const customer = buildCustomer360("COMPANY001", history[1], history, null, changes.signals);
  assert.ok(customer);
  assert.deepEqual(customer.history.map((point) => point.snapshotId), ["before", "after"]);
  assert.deepEqual(customer.history.map((point) => point.knownOpenPipelineValue), [100, 175]);
  assert.deepEqual(customer.history.map((point) => point.receivables), [10, 30]);
});

test("sparse and empty persisted history remain explicit", async () => {
  const one = createTemporalHistoricalSnapshotProvider(historyStore([storedSnapshot({ id: "only", snapshotTime: "2026-08-25T10:05:00Z" })]));
  const sparse = detectChangeIntelligence(await one.listSnapshots());
  assert.equal(sparse.uniqueSnapshotCount, 1);
  assert.deepEqual(sparse.signals, []);
  assert.match(sparse.caveats[0], /at least two distinct historical snapshots/i);
  const none = createTemporalHistoricalSnapshotProvider(historyStore([]));
  assert.deepEqual(await none.listSnapshots(), []);
});

test("history adapter and normal tests do not require DATABASE_URL and preserve nulls", async () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.equal(await createConfiguredHistoricalSnapshotProvider({ databaseUrl: "" }), null);
    const provider = createTemporalHistoricalSnapshotProvider(historyStore([
      storedSnapshot({ id: "local", snapshotTime: "2026-08-25T10:05:00Z", dealValue: null, receivable: null }),
    ]));
    const [result] = await provider.listSnapshots();
    assert.equal(result.deals[0].value, null);
    assert.equal(result.workOrders[0].amountReceivable, null);
  } finally {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  }
});
