import type {
  ListSuccessfulSnapshotsInput,
  PersistSnapshotInput,
  TemporalSnapshotStore,
} from "./contracts";
import { observeOperation } from "@/lib/server/telemetry";

export function instrumentTemporalSnapshotStore(
  store: TemporalSnapshotStore,
  workspaceKey?: string,
): TemporalSnapshotStore {
  const observe = <T>(operation: string, fn: () => Promise<T>) =>
    observeOperation(`database.${operation}`, { operation, workspaceKey }, fn);

  return {
    beginSync: (input) => observe("begin_sync", () => store.beginSync(input)),
    persistSnapshot: (input: PersistSnapshotInput) => observe("persist_snapshot", () => store.persistSnapshot(input)),
    completeSync: (input) => observe("complete_sync", () => store.completeSync(input)),
    failSync: (input) => observe("fail_sync", () => store.failSync(input)),
    loadLatestSuccessfulSnapshot: (key) => observe("load_latest_snapshot", () => store.loadLatestSuccessfulSnapshot(key)),
    listSuccessfulSnapshots: (input: ListSuccessfulSnapshotsInput) => observe("snapshot_enumeration", () => store.listSuccessfulSnapshots(input)),
    getFreshness: (input) => observe("read_freshness", () => store.getFreshness(input)),
  };
}
