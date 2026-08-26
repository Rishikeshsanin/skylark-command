import {
  createTemporalHistoricalSnapshotProvider,
  toHistoricalBusinessSnapshot,
  type HistoricalSnapshotProvider,
  type HistoricalSnapshotQuery,
} from "./change-history-core";

const DEFAULT_HISTORY_LIMIT = 50;
const DEFAULT_WORKSPACE_KEY = "skylark-command";

export {
  createTemporalHistoricalSnapshotProvider,
  toHistoricalBusinessSnapshot,
  type HistoricalSnapshotProvider,
  type HistoricalSnapshotQuery,
} from "./change-history-core";

export async function createConfiguredHistoricalSnapshotProvider(options: {
  databaseUrl?: string | null;
  workspaceKey?: string;
} = {}): Promise<HistoricalSnapshotProvider | null> {
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) return null;

  const { createPostgresTemporalSnapshotStore } = await import("./data-platform/postgres");
  return createTemporalHistoricalSnapshotProvider(
    createPostgresTemporalSnapshotStore(),
    options.workspaceKey ?? process.env.SKYLARK_WORKSPACE_KEY?.trim() ?? DEFAULT_WORKSPACE_KEY,
  );
}

function chronological<T extends { capturedAt: string; snapshotId: string }>(snapshots: T[]): T[] {
  return [...snapshots].sort(
    (a, b) =>
      Date.parse(a.capturedAt) - Date.parse(b.capturedAt) ||
      a.snapshotId.localeCompare(b.snapshotId),
  );
}

/**
 * Loads persisted successful history when Postgres is configured. If no durable
 * history exists (or the default configured provider is temporarily unavailable),
 * the current source-truth snapshot remains the sparse, non-synthetic fallback.
 */
export async function loadAvailableChangeSnapshots(
  provider?: HistoricalSnapshotProvider,
  query: HistoricalSnapshotQuery = {},
) {
  const resolvedProvider = provider ?? await createConfiguredHistoricalSnapshotProvider();
  if (resolvedProvider) {
    try {
      const persisted = await resolvedProvider.listSnapshots({
        ...query,
        limit: query.limit ?? DEFAULT_HISTORY_LIMIT,
        order: query.order ?? "desc",
      });
      if (persisted.length > 0) return chronological(persisted);
    } catch (error) {
      if (provider) throw error;
      // Default durable history is an availability enhancement; live source truth remains the migration fallback.
    }
  }

  const { loadBusinessData } = await import("./business-data");
  const current = await loadBusinessData();
  return [toHistoricalBusinessSnapshot(current)];
}
