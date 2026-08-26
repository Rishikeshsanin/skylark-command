import { afterEach, describe, expect, it, vi } from "vitest";
import type { TemporalSnapshotStore } from "@/lib/data-platform/contracts";
import { runBusinessDataSyncCore } from "@/lib/data-platform/sync-core";

const store: TemporalSnapshotStore = {
  async beginSync(input) {
    return { id: input.syncId, workspaceKey: input.workspaceKey, sourceProvider: "monday.com", startedAt: input.startedAt, finishedAt: null, status: "syncing", recordsFetched: 0, recordsNormalized: 0, recordsPersisted: 0, error: null, sourceWatermark: null, snapshotId: null };
  },
  async persistSnapshot(input) { return { snapshotId: input.snapshotId, recordsPersisted: 0, reusedExistingSnapshot: false }; },
  async completeSync(input) { return { id: input.syncId, workspaceKey: "workspace-test", sourceProvider: "monday.com", startedAt: "2026-01-01T00:00:00.000Z", finishedAt: input.finishedAt, status: "succeeded", recordsFetched: input.recordsFetched, recordsNormalized: input.recordsNormalized, recordsPersisted: input.recordsPersisted, error: null, sourceWatermark: input.sourceWatermark, snapshotId: input.snapshotId }; },
  async failSync(input) { return { id: input.syncId, workspaceKey: "workspace-test", sourceProvider: "monday.com", startedAt: "2026-01-01T00:00:00.000Z", finishedAt: input.finishedAt, status: "failed", recordsFetched: 0, recordsNormalized: 0, recordsPersisted: 0, error: input.error, sourceWatermark: null, snapshotId: null }; },
  async loadLatestSuccessfulSnapshot() { return null; },
  async listSuccessfulSnapshots() { return []; },
  async getFreshness() { return { state: "fresh", lastSyncStartedAt: "2026-01-01T00:00:00.000Z", lastSyncSucceededAt: "2026-01-01T00:00:01.000Z", sourceWatermark: "watermark", servedSnapshotAt: "2026-01-01T00:00:01.000Z" }; },
};

afterEach(() => vi.restoreAllMocks());

describe("sync telemetry", () => {
  it("emits sync id, record counts, freshness, watermark and duration", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    let id = 0;
    await runBusinessDataSyncCore({
      store,
      workspaceKey: "workspace-test",
      createId: () => `id-${++id}`,
      now: () => new Date("2026-01-01T00:00:01.000Z"),
      liveLoader: async () => ({
        deals: [], workOrders: [], normalizationIssues: [],
        source: { provider: "monday.com", dealsBoardId: "deals", workOrdersBoardId: "work-orders", dealsBoardName: "Deals", workOrdersBoardName: "Work Orders", fetchedAt: "2026-01-01T00:00:00.000Z", dataMode: "live" },
      }),
    });
    const output = info.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("data.sync.succeeded");
    expect(output).toContain('"syncId":"id-1"');
    expect(output).toContain('"recordsFetched":0');
    expect(output).toContain('"recordsNormalized":0');
    expect(output).toContain('"recordsPersisted":0');
    expect(output).toContain('"freshnessState":"fresh"');
    expect(output).toContain('"sourceWatermark"');
    expect(output).toContain('"durationMs"');
  });
});
