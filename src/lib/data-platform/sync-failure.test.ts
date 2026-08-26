import { describe, expect, it } from "vitest";
import type { TemporalSnapshotStore } from "./contracts";
import { runBusinessDataSyncCore } from "./sync-core";

describe("temporal synchronization failure handling", () => {
  it("does not mask the root source failure when failure persistence also errors", async () => {
    const store = {
      async beginSync() {
        return {
          id: "sync-1",
          workspaceKey: "skylark-command",
          sourceProvider: "monday.com" as const,
          startedAt: "2026-08-26T00:00:00.000Z",
          finishedAt: null,
          status: "syncing" as const,
          recordsFetched: 0,
          recordsNormalized: 0,
          recordsPersisted: 0,
          error: null,
          sourceWatermark: null,
          snapshotId: null,
        };
      },
      async failSync() {
        throw new Error("database unavailable while recording failure");
      },
    } as unknown as TemporalSnapshotStore;

    await expect(runBusinessDataSyncCore({
      store,
      liveLoader: async () => {
        throw new Error("monday source unavailable");
      },
      now: () => new Date("2026-08-26T00:00:00.000Z"),
      createId: () => "sync-1",
    })).rejects.toThrow("monday source unavailable");
  });
});
