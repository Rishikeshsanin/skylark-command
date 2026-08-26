import { describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { PostgresTemporalSnapshotStore } from "./postgres";

interface FakeRun {
  id: string;
  workspace_key: string;
  source_provider: "monday.com";
  started_at: string;
  finished_at: string | null;
  status: "syncing" | "succeeded" | "failed";
  records_fetched: number;
  records_normalized: number;
  records_persisted: number;
  error_text: string | null;
  source_watermark: string | null;
  snapshot_id: string | null;
}

function run(overrides: Partial<FakeRun> & Pick<FakeRun, "id" | "started_at">): FakeRun {
  return {
    id: overrides.id,
    workspace_key: "skylark-command",
    source_provider: "monday.com",
    started_at: overrides.started_at,
    finished_at: null,
    status: "syncing",
    records_fetched: 0,
    records_normalized: 0,
    records_persisted: 0,
    error_text: null,
    source_watermark: null,
    snapshot_id: null,
    ...overrides,
  };
}

function fakeSqlForRuns(runs: FakeRun[]) {
  const tagged = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("UPDATE sync_runs") && text.includes("exceeded its active lease")) {
      const finishedAt = String(values[0]);
      const workspaceKey = String(values[1]);
      const cutoff = String(values[2]);
      for (const candidate of runs) {
        if (
          candidate.workspace_key === workspaceKey &&
          candidate.status === "syncing" &&
          Date.parse(candidate.started_at) < Date.parse(cutoff)
        ) {
          candidate.status = "failed";
          candidate.finished_at = candidate.finished_at ?? finishedAt;
          candidate.error_text = candidate.error_text ?? "Prior synchronization exceeded its active lease and was marked failed before a new sync began.";
        }
      }
      return [];
    }
    if (text.includes("SELECT id") && text.includes("status = 'syncing'")) {
      const workspaceKey = String(values[0]);
      return runs
        .filter((candidate) => candidate.workspace_key === workspaceKey && candidate.status === "syncing")
        .slice(0, 1)
        .map(({ id }) => ({ id }));
    }
    if (text.includes("INSERT INTO sync_runs")) {
      const created = run({
        id: String(values[0]),
        workspace_key: String(values[1]),
        started_at: String(values[2]),
      });
      runs.push(created);
      return [created];
    }
    return [];
  };

  const sql = tagged as unknown as Sql;
  Object.assign(sql, {
    begin: async (callback: (tx: Sql) => Promise<unknown>) => callback(sql),
  });
  return sql;
}

describe("Postgres temporal sync lease", () => {
  it("recovers an abandoned sync before starting the next run", async () => {
    const runs = [run({ id: "stale", started_at: "2026-08-26T00:00:00.000Z" })];
    const store = new PostgresTemporalSnapshotStore(fakeSqlForRuns(runs));

    const created = await store.beginSync({
      syncId: "next",
      workspaceKey: "skylark-command",
      startedAt: "2026-08-26T00:20:00.000Z",
    });

    expect(runs[0].status).toBe("failed");
    expect(runs[0].finished_at).toBe("2026-08-26T00:20:00.000Z");
    expect(created.id).toBe("next");
    expect(created.status).toBe("syncing");
  });

  it("fails closed while a recent sync lease is still active", async () => {
    const runs = [run({ id: "active", started_at: "2026-08-26T00:10:00.000Z" })];
    const store = new PostgresTemporalSnapshotStore(fakeSqlForRuns(runs));

    await expect(store.beginSync({
      syncId: "overlap",
      workspaceKey: "skylark-command",
      startedAt: "2026-08-26T00:20:00.000Z",
    })).rejects.toThrow(/already in progress/i);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("syncing");
  });
});
