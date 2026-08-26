import assert from "node:assert/strict";
import test from "node:test";
import {
  createConfiguredHistoricalSnapshotProvider,
} from "@/lib/change-history";
import {
  createTemporalHistoricalSnapshotProvider,
} from "@/lib/change-history-core";
import {
  buildCustomer360,
  detectChangeIntelligence,
} from "@/lib/analytics";
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
  return {
    deals: [makeDeal({
      mondayItemId: "deal-1",
      normalizedClientKey: "COMPANY001",
      status: "Open",
      value: input.dealValue ?? 100,
    })],
    workOrders: [makeWorkOrder({
      mondayItemId: "wo-1",
      normalizedClientKey: "COMPANY001",
      amountReceivable: input.receivable ?? 10,
    })],
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
  const normalized = normalizeSuccessfulSnapshotQuery({
    workspaceKey: "  skylark-command  ",
    fromSnapshotTime: "2026-08-20T10:00:00Z",
    toSnapshotTime: "2026-08-25T10:00:00Z",
    limit: 999,
    order: "desc",
  });
  assert.equal(normalized.workspaceKey, "skylark-command");
  assert.equal(normalized.limit, 100);
  assert.equal(normalized.order, "desc");
  assert.equal(normalized.fromSnapshotTime, "2026-08-20T10:00:00.000Z");
  assert.throws(
    () => normalizeSuccessfulSnapshotQuery({
      workspaceKey: "skylark-command",
      fromSnapshotTime: "2026-08-26T00:00:00Z",
      toSnapshotTime: "2026-08-25T00:00:00Z",
    }),
    /fromSnapshotTime/,
  );
});

test("temporal historical provider preserves persisted snapshot ids and chronology", async () => {
  const early = storedSnapshot({
    id: "snapshot-a",
    snapshotTime: "2026-08-24T10:05:00Z",
    fetchedAt: "2026-08-24T10:00:00Z",
    watermark: `sha256:${"a".repeat(64)}`,
  });
  const late = storedSnapshot({
    id: "snapshot-b",
    snapshotTime: "2026-08-25T10:05:00Z",
    fetchedAt: "2026-08-25T10:00:00Z",
    watermark: `sha256:${"b".repeat(64)}`,
  });
  const provider = createTemporalHistoricalSnapshotProvider(historyStore([early, late]));
  const result = await provider.listSnapshots({ order: "asc", limit: 10 });

  assert.deepEqual(result.map((item) => item.snapshotId), ["snapshot-a", "snapshot-b"]);
  assert.deepEqual(result.map((item) => item.capturedAt), [early.temporal.snapshotTime, late.temporal.snapshotTime]);
  assert.equal(result[0].deals[0].mondayItemId, "deal-1");
  assert.equal(early.source.fetchedAt, "2026-08-24T10:00:00Z");
  assert.equal(early.temporal.sourceWatermark, `sha256:${"a".repeat(64)}`);
});

test("persisted temporal snapshots drive deterministic Change Detective evidence", async () => {
  const before = storedSnapshot({
    id: "before",
    snapshotTime: "2026-08-24T10:05:00Z",
    dealValue: 100,
    receivable: 10,
  });
  const after = storedSnapshot({
    id: "after",
    snapshotTime: "2026-08-25T10:05:00Z",
    dealValue: 150,
    receivable: 20,
  });
  const provider = createTemporalHistoricalSnapshotProvider(historyStore([before, after]));
  const changes = detectChangeIntelligence(await provider.listSnapshots({ order: "asc" }));

  const pipeline = changes.signals.find((signal) => signal.type === "open_pipeline_change");
  assert.ok(pipeline);
  assert.equal(pipeline.delta, 50);
  assert.deepEqual(pipeline.evidence.dealItemIds, ["deal-1"]);
  assert.deepEqual(pipeline.sourceSnapshotIds, { from: "before", to: "after" });

  const receivables = changes.signals.find((signal) => signal.type === "receivables_change");
  assert.ok(receivables);
  assert.deepEqual(receivables.evidence.workOrderItemIds, ["wo-1"]);
});

test("persisted temporal snapshots populate Customer 360 history", async () => {
  const before = storedSnapshot({
    id: "before",
    snapshotTime: "2026-08-24T10:05:00Z",
    dealValue: 100,
    receivable: 10,
  });
  const after = storedSnapshot({
    id: "after",
    snapshotTime: "2026-08-25T10:05:00Z",
    dealValue: 175,
    receivable: 30,
  });
  const provider = createTemporalHistoricalSnapshotProvider(historyStore([before, after]));
  const history = await provider.listSnapshots({ order: "asc" });
  const changes = detectChangeIntelligence(history);
  const customer = buildCustomer360("COMPANY001", history[1], history, null, changes.signals);

  assert.ok(customer);
  assert.deepEqual(customer.history.map((point) => point.snapshotId), ["before", "after"]);
  assert.deepEqual(customer.history.map((point) => point.knownOpenPipelineValue), [100, 175]);
  assert.deepEqual(customer.history.map((point) => point.receivables), [10, 30]);
  assert.ok(customer.attention.changeSignals.every((signal) => signal.affected.customer === "COMPANY001"));
});

test("sparse and empty persisted history stay explicit rather than synthetic", async () => {
  const one = createTemporalHistoricalSnapshotProvider(historyStore([
    storedSnapshot({ id: "only", snapshotTime: "2026-08-25T10:05:00Z" }),
  ]));
  const sparseChanges = detectChangeIntelligence(await one.listSnapshots());
  assert.equal(sparseChanges.uniqueSnapshotCount, 1);
  assert.deepEqual(sparseChanges.signals, []);
  assert.match(sparseChanges.caveats[0], /at least two distinct historical snapshots/i);

  const none = createTemporalHistoricalSnapshotProvider(historyStore([]));
  assert.deepEqual(await none.listSnapshots(), []);
  assert.equal(detectChangeIntelligence([]).uniqueSnapshotCount, 0);
});

test("history adapter and normal tests do not require DATABASE_URL", async () => {
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
