import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import type { BusinessDataSnapshot } from "@/lib/business-data";
import type {
  ListSuccessfulSnapshotsInput,
  PersistSnapshotInput,
  PersistSnapshotResult,
  StoredBusinessDataSnapshot,
  SyncRunRecord,
  TemporalFreshness,
  TemporalSnapshotStore,
} from "@/lib/data-platform/contracts";
import { normalizeSuccessfulSnapshotQuery } from "@/lib/data-platform/history-query";
import { loadBusinessDataFromTemporalStore } from "@/lib/data-platform/serving-core";
import { runBusinessDataSyncCore } from "@/lib/data-platform/sync-core";
import { calculateSourceWatermark } from "@/lib/data-platform/watermark";
import { makeDeal, makeWorkOrder } from "./fixtures";

class MemoryTemporalStore implements TemporalSnapshotStore {
  runs: SyncRunRecord[] = [];
  snapshotsByWatermark = new Map<string, StoredBusinessDataSnapshot>();
  snapshotsById = new Map<string, StoredBusinessDataSnapshot>();

  async beginSync(input: { syncId: string; workspaceKey: string; startedAt: string }) {
    const run: SyncRunRecord = {
      id: input.syncId,
      workspaceKey: input.workspaceKey,
      sourceProvider: "monday.com",
      startedAt: input.startedAt,
      finishedAt: null,
      status: "syncing",
      recordsFetched: 0,
      recordsNormalized: 0,
      recordsPersisted: 0,
      error: null,
      sourceWatermark: null,
      snapshotId: null,
    };
    this.runs.push(run);
    return { ...run };
  }

  async persistSnapshot(input: PersistSnapshotInput): Promise<PersistSnapshotResult> {
    const existing = this.snapshotsByWatermark.get(input.sourceWatermark);
    if (existing) {
      return {
        snapshotId: existing.temporal.snapshotId,
        recordsPersisted: 0,
        reusedExistingSnapshot: true,
      };
    }

    const stored: StoredBusinessDataSnapshot = {
      ...input.snapshot,
      temporal: {
        snapshotId: input.snapshotId,
        snapshotTime: input.snapshotTime,
        sourceWatermark: input.sourceWatermark,
      },
    };
    this.snapshotsByWatermark.set(input.sourceWatermark, stored);
    this.snapshotsById.set(input.snapshotId, stored);
    return {
      snapshotId: input.snapshotId,
      recordsPersisted: input.snapshot.deals.length + input.snapshot.workOrders.length,
      reusedExistingSnapshot: false,
    };
  }

  async completeSync(input: {
    syncId: string;
    finishedAt: string;
    recordsFetched: number;
    recordsNormalized: number;
    recordsPersisted: number;
    sourceWatermark: string;
    snapshotId: string;
  }) {
    const run = this.runs.find((candidate) => candidate.id === input.syncId);
    assert.ok(run);
    Object.assign(run, {
      finishedAt: input.finishedAt,
      status: "succeeded" as const,
      recordsFetched: input.recordsFetched,
      recordsNormalized: input.recordsNormalized,
      recordsPersisted: input.recordsPersisted,
      sourceWatermark: input.sourceWatermark,
      snapshotId: input.snapshotId,
      error: null,
    });
    return { ...run };
  }

  async failSync(input: { syncId: string; finishedAt: string; error: string }) {
    const run = this.runs.find((candidate) => candidate.id === input.syncId);
    assert.ok(run);
    Object.assign(run, { finishedAt: input.finishedAt, status: "failed" as const, error: input.error });
    return { ...run };
  }

  async loadLatestSuccessfulSnapshot(workspaceKey: string) {
    const success = [...this.runs]
      .reverse()
      .find((run) => run.workspaceKey === workspaceKey && run.status === "succeeded" && run.snapshotId);
    return success?.snapshotId ? this.snapshotsById.get(success.snapshotId) ?? null : null;
  }

  async listSuccessfulSnapshots(input: ListSuccessfulSnapshotsInput) {
    const query = normalizeSuccessfulSnapshotQuery(input);
    const successfulSnapshotIds = new Set(
      this.runs
        .filter((run) => run.workspaceKey === query.workspaceKey && run.status === "succeeded" && run.snapshotId)
        .map((run) => run.snapshotId as string),
    );
    const uniqueByWatermark = new Map<string, StoredBusinessDataSnapshot>();
    for (const snapshot of this.snapshotsById.values()) {
      if (!successfulSnapshotIds.has(snapshot.temporal.snapshotId)) continue;
      if (query.fromSnapshotTime && Date.parse(snapshot.temporal.snapshotTime) < Date.parse(query.fromSnapshotTime)) continue;
      if (query.toSnapshotTime && Date.parse(snapshot.temporal.snapshotTime) > Date.parse(query.toSnapshotTime)) continue;
      if (!uniqueByWatermark.has(snapshot.temporal.sourceWatermark)) {
        uniqueByWatermark.set(snapshot.temporal.sourceWatermark, snapshot);
      }
    }
    return [...uniqueByWatermark.values()]
      .sort((a, b) => {
        const delta = Date.parse(a.temporal.snapshotTime) - Date.parse(b.temporal.snapshotTime)
          || a.temporal.snapshotId.localeCompare(b.temporal.snapshotId);
        return query.order === "asc" ? delta : -delta;
      })
      .slice(0, query.limit);
  }

  async getFreshness(input: { workspaceKey: string; now: string; staleAfterMs: number }): Promise<TemporalFreshness> {
    const workspaceRuns = this.runs.filter((run) => run.workspaceKey === input.workspaceKey);
    const latest = workspaceRuns.at(-1);
    const success = [...workspaceRuns].reverse().find((run) => run.status === "succeeded" && run.snapshotId);
    const stored = success?.snapshotId ? this.snapshotsById.get(success.snapshotId) : undefined;

    let state: TemporalFreshness["state"];
    if (latest?.status === "syncing") state = "syncing";
    else if (latest?.status === "failed") state = "failed";
    else if (!success?.finishedAt) state = "stale";
    else state = Date.parse(input.now) - Date.parse(success.finishedAt) > input.staleAfterMs ? "stale" : "fresh";

    return {
      state,
      lastSyncStartedAt: latest?.startedAt ?? null,
      lastSyncSucceededAt: success?.finishedAt ?? null,
      sourceWatermark: success?.sourceWatermark ?? null,
      servedSnapshotAt: stored?.temporal.snapshotTime ?? null,
    };
  }
}

function snapshot(fetchedAt = "2026-08-25T10:00:00.000Z"): BusinessDataSnapshot {
  return {
    deals: [
      makeDeal({ mondayItemId: "deal-1", normalizedClientKey: "COMPANY001", value: null, closeDate: null, tentativeCloseDate: "2026-09-30" }),
      makeDeal({ mondayItemId: "deal-2", normalizedClientKey: "COMPANY002", value: 500 }),
    ],
    workOrders: [
      makeWorkOrder({ mondayItemId: "wo-1", normalizedClientKey: "COMPANY001", amountReceivable: null, probableEndDate: null }),
    ],
    normalizationIssues: [],
    source: {
      provider: "monday.com",
      dealsBoardId: "5030844099",
      workOrdersBoardId: "5030844103",
      dealsBoardName: "Skylark Command — Deals",
      workOrdersBoardName: "Skylark Command — Work Orders",
      fetchedAt,
      dataMode: "live",
    },
  };
}

function idSequence(...ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function syncOptions(store: MemoryTemporalStore, liveLoader: () => Promise<BusinessDataSnapshot>, ids: string[], at: string) {
  return {
    store,
    liveLoader,
    workspaceKey: "skylark-command",
    now: () => new Date(at),
    createId: idSequence(...ids),
  };
}

test("migration defines temporal sync and historical snapshot constraints", async () => {
  const path = join(process.cwd(), "src/lib/data-platform/migrations/001_temporal_intelligence.sql");
  const sql = await readFile(path, "utf8");
  for (const required of [
    "CREATE TABLE IF NOT EXISTS schema_migrations",
    "CREATE TABLE IF NOT EXISTS sync_runs",
    "CREATE TABLE IF NOT EXISTS analytical_snapshots",
    "CREATE TABLE IF NOT EXISTS deal_snapshots",
    "CREATE TABLE IF NOT EXISTS work_order_snapshots",
    "UNIQUE (workspace_key, source_watermark)",
    "normalized_payload JSONB NOT NULL",
    "source_watermark TEXT",
  ]) assert.ok(sql.includes(required), `migration should include ${required}`);
});

test("source watermark is stable across row order and fetch timestamps", () => {
  const first = snapshot("2026-08-25T10:00:00.000Z");
  const second = snapshot("2026-08-25T11:00:00.000Z");
  second.deals.reverse();
  assert.equal(calculateSourceWatermark(first), calculateSourceWatermark(second));
  second.deals[0] = { ...second.deals[0], value: 999 };
  assert.notEqual(calculateSourceWatermark(first), calculateSourceWatermark(second));
});

test("sync is idempotent while recording every successful run", async () => {
  const store = new MemoryTemporalStore();
  const first = await runBusinessDataSyncCore(syncOptions(store, async () => snapshot("2026-08-25T10:00:00.000Z"), ["sync-1", "snapshot-1"], "2026-08-25T10:05:00.000Z"));
  const second = await runBusinessDataSyncCore(syncOptions(store, async () => snapshot("2026-08-25T11:00:00.000Z"), ["sync-2", "snapshot-2"], "2026-08-25T11:05:00.000Z"));

  assert.equal(first.recordsPersisted, 3);
  assert.equal(first.reusedExistingSnapshot, false);
  assert.equal(second.recordsPersisted, 0);
  assert.equal(second.reusedExistingSnapshot, true);
  assert.equal(second.snapshotId, "snapshot-1");
  assert.equal(store.snapshotsById.size, 1);
  assert.equal(store.runs.length, 2);
  assert.equal(store.runs[1].status, "succeeded");
});

test("latest successful snapshot preserves nulls and source provenance", async () => {
  const store = new MemoryTemporalStore();
  await runBusinessDataSyncCore(syncOptions(store, async () => snapshot(), ["sync-1", "snapshot-1"], "2026-08-25T10:05:00.000Z"));
  const stored = await store.loadLatestSuccessfulSnapshot("skylark-command");

  assert.ok(stored);
  assert.equal(stored.deals[0].value, null);
  assert.equal(stored.deals[0].closeDate, null);
  assert.equal(stored.workOrders[0].amountReceivable, null);
  assert.equal(stored.workOrders[0].probableEndDate, null);
  assert.equal(stored.source.dealsBoardId, "5030844099");
  assert.equal(stored.source.workOrdersBoardName, "Skylark Command — Work Orders");
  assert.equal(stored.source.fetchedAt, "2026-08-25T10:00:00.000Z");
  assert.match(stored.temporal.sourceWatermark, /^sha256:[a-f0-9]{64}$/);
});

test("successful snapshot enumeration is bounded, ordered, workspace-scoped and deduplicated", async () => {
  const store = new MemoryTemporalStore();
  await runBusinessDataSyncCore(syncOptions(store, async () => snapshot("2026-08-25T10:00:00.000Z"), ["sync-1", "snapshot-1"], "2026-08-25T10:05:00.000Z"));
  await runBusinessDataSyncCore(syncOptions(store, async () => snapshot("2026-08-25T11:00:00.000Z"), ["sync-2", "snapshot-2"], "2026-08-25T11:05:00.000Z"));
  const changed = snapshot("2026-08-25T12:00:00.000Z");
  changed.deals[1] = { ...changed.deals[1], value: 900 };
  await runBusinessDataSyncCore(syncOptions(store, async () => changed, ["sync-3", "snapshot-3"], "2026-08-25T12:05:00.000Z"));

  const desc = await store.listSuccessfulSnapshots({ workspaceKey: "skylark-command", order: "desc", limit: 1 });
  assert.equal(desc.length, 1);
  assert.equal(desc[0].temporal.snapshotId, "snapshot-3");
  assert.equal((await store.listSuccessfulSnapshots({ workspaceKey: "other-workspace" })).length, 0);
  assert.equal(store.snapshotsById.size, 2);
});

test("freshness distinguishes fresh, stale, syncing, and failed", async () => {
  const store = new MemoryTemporalStore();
  await runBusinessDataSyncCore(syncOptions(store, async () => snapshot(), ["sync-1", "snapshot-1"], "2026-08-25T10:05:00.000Z"));

  assert.equal((await store.getFreshness({ workspaceKey: "skylark-command", now: "2026-08-25T10:30:00.000Z", staleAfterMs: 3_600_000 })).state, "fresh");
  assert.equal((await store.getFreshness({ workspaceKey: "skylark-command", now: "2026-08-25T12:30:00.000Z", staleAfterMs: 3_600_000 })).state, "stale");
  await store.beginSync({ syncId: "sync-2", workspaceKey: "skylark-command", startedAt: "2026-08-25T12:31:00.000Z" });
  assert.equal((await store.getFreshness({ workspaceKey: "skylark-command", now: "2026-08-25T12:31:30.000Z", staleAfterMs: 3_600_000 })).state, "syncing");
  await store.failSync({ syncId: "sync-2", finishedAt: "2026-08-25T12:32:00.000Z", error: "upstream unavailable" });
  const failed = await store.getFreshness({ workspaceKey: "skylark-command", now: "2026-08-25T12:32:00.000Z", staleAfterMs: 3_600_000 });
  assert.equal(failed.state, "failed");
  assert.equal(failed.lastSyncSucceededAt, "2026-08-25T10:05:00.000Z");
  assert.equal(failed.servedSnapshotAt, "2026-08-25T10:05:00.000Z");
});

test("failed sync preserves last-known-good snapshot", async () => {
  const store = new MemoryTemporalStore();
  await runBusinessDataSyncCore(syncOptions(store, async () => snapshot(), ["sync-1", "snapshot-1"], "2026-08-25T10:05:00.000Z"));
  await assert.rejects(
    runBusinessDataSyncCore(syncOptions(store, async () => { throw new Error("monday outage"); }, ["sync-2"], "2026-08-25T11:00:00.000Z")),
    /monday outage/,
  );
  assert.equal((await store.loadLatestSuccessfulSnapshot("skylark-command"))?.temporal.snapshotId, "snapshot-1");
  assert.equal(store.runs.at(-1)?.status, "failed");
});

test("temporal preferred serves LKG without live fetch and exposes provenance", async () => {
  const store = new MemoryTemporalStore();
  await runBusinessDataSyncCore(syncOptions(store, async () => snapshot(), ["sync-1", "snapshot-1"], "2026-08-25T10:05:00.000Z"));
  let liveCalls = 0;
  const served = await loadBusinessDataFromTemporalStore({
    mode: "temporal_preferred",
    store,
    now: new Date("2026-08-25T10:30:00.000Z"),
    liveLoader: async () => { liveCalls += 1; return snapshot("2026-08-25T10:30:00.000Z"); },
  });

  assert.equal(liveCalls, 0);
  assert.equal(served.source.dataMode, "temporal");
  assert.equal(served.source.freshnessState, "fresh");
  assert.equal(served.source.lastSyncSucceededAt, "2026-08-25T10:05:00.000Z");
  assert.equal(served.source.servedSnapshotAt, "2026-08-25T10:05:00.000Z");
  assert.match(served.source.sourceWatermark ?? "", /^sha256:/);
});

test("temporal preferred falls back live only when no LKG is available", async () => {
  const store = new MemoryTemporalStore();
  let liveCalls = 0;
  const live = snapshot("2026-08-25T12:00:00.000Z");
  const served = await loadBusinessDataFromTemporalStore({
    mode: "temporal_preferred",
    store,
    liveLoader: async () => { liveCalls += 1; return live; },
  });
  assert.equal(liveCalls, 1);
  assert.equal(served.source.dataMode, "live");
  assert.equal(served.source.fetchedAt, live.source.fetchedAt);
});

test("temporal only refuses to hide missing persistent state", async () => {
  await assert.rejects(
    loadBusinessDataFromTemporalStore({ mode: "temporal_only", store: new MemoryTemporalStore(), liveLoader: async () => snapshot() }),
    /No successful temporal snapshot/,
  );
});