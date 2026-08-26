import {
  createTemporalHistoricalSnapshotProvider,
  toHistoricalBusinessSnapshot,
  type HistoricalSnapshotProvider,
  type HistoricalSnapshotQuery,
} from "./change-history-core";
import { instrumentTemporalSnapshotStore } from "./data-platform/instrumented-store";
import { observeOperation } from "./server/telemetry";
import type { HistoricalBusinessSnapshot } from "@/types";

const DEFAULT_HISTORY_LIMIT = 50;
const DEFAULT_WORKSPACE_KEY = "skylark-command";
const SKYLARK_HISTORY_BRIDGE_URL =
  "https://nowlwprtcnieihelqjoa.supabase.co/functions/v1/skylark-command-history";

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

  const workspaceKey = options.workspaceKey ?? process.env.SKYLARK_WORKSPACE_KEY?.trim() ?? DEFAULT_WORKSPACE_KEY;
  const { createPostgresTemporalSnapshotStore } = await import("./data-platform/postgres");
  return createTemporalHistoricalSnapshotProvider(
    instrumentTemporalSnapshotStore(createPostgresTemporalSnapshotStore(), workspaceKey),
    workspaceKey,
  );
}

export function createVercelOidcHistoricalSnapshotProvider(options: {
  oidcToken?: string | null;
  workspaceKey?: string;
  fetchImpl?: typeof fetch;
} = {}): HistoricalSnapshotProvider | null {
  const oidcToken = options.oidcToken ?? process.env.VERCEL_OIDC_TOKEN;
  if (!oidcToken?.trim()) return null;

  const workspaceKey = options.workspaceKey ?? process.env.SKYLARK_WORKSPACE_KEY?.trim() ?? DEFAULT_WORKSPACE_KEY;
  if (workspaceKey !== DEFAULT_WORKSPACE_KEY) return null;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async listSnapshots(query = {}) {
      const response = await fetchImpl(SKYLARK_HISTORY_BRIDGE_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${oidcToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspaceKey,
          fromSnapshotTime: query.fromSnapshotTime,
          toSnapshotTime: query.toSnapshotTime,
          limit: Math.min(query.limit ?? DEFAULT_HISTORY_LIMIT - 1, DEFAULT_HISTORY_LIMIT - 1),
          order: query.order ?? "desc",
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new Error(`Skylark history bridge returned ${response.status}.`);
      }

      const payload = await response.json() as { snapshots?: HistoricalBusinessSnapshot[] };
      if (!Array.isArray(payload.snapshots)) {
        throw new Error("Skylark history bridge returned an invalid payload.");
      }
      return payload.snapshots;
    },
  };
}

function chronological<T extends { capturedAt: string; snapshotId: string }>(snapshots: T[]): T[] {
  return [...snapshots].sort(
    (a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt) || a.snapshotId.localeCompare(b.snapshotId),
  );
}

function withinQuery(snapshot: HistoricalBusinessSnapshot, query: HistoricalSnapshotQuery): boolean {
  const capturedAt = Date.parse(snapshot.capturedAt);
  if (query.fromSnapshotTime && capturedAt < Date.parse(query.fromSnapshotTime)) return false;
  if (query.toSnapshotTime && capturedAt > Date.parse(query.toSnapshotTime)) return false;
  return true;
}

export function combinePersistedAndLiveHistory(
  persisted: HistoricalBusinessSnapshot[],
  live: HistoricalBusinessSnapshot,
  query: HistoricalSnapshotQuery = {},
): HistoricalBusinessSnapshot[] {
  const combined = withinQuery(live, query) ? [...persisted, live] : [...persisted];
  const unique = new Map(combined.map((snapshot) => [snapshot.snapshotId, snapshot]));
  const ordered = chronological([...unique.values()]);
  const limit = Math.max(1, Math.min(query.limit ?? DEFAULT_HISTORY_LIMIT, DEFAULT_HISTORY_LIMIT));
  return ordered.slice(-limit);
}

export async function loadAvailableChangeSnapshots(
  provider?: HistoricalSnapshotProvider,
  query: HistoricalSnapshotQuery = {},
) {
  return observeOperation("analytics.snapshot_enumeration", { operation: "snapshot_enumeration" }, async () => {
    const configuredProvider = provider ?? await createConfiguredHistoricalSnapshotProvider();
    const resolvedProvider = configuredProvider ?? (provider ? null : createVercelOidcHistoricalSnapshotProvider());
    let persisted: HistoricalBusinessSnapshot[] = [];

    if (resolvedProvider) {
      try {
        persisted = await resolvedProvider.listSnapshots({
          ...query,
          limit: provider
            ? query.limit ?? DEFAULT_HISTORY_LIMIT
            : Math.max(1, Math.min((query.limit ?? DEFAULT_HISTORY_LIMIT) - 1, DEFAULT_HISTORY_LIMIT - 1)),
          order: query.order ?? "desc",
        });
        if (provider) return chronological(persisted);
      } catch (error) {
        if (provider) throw error;
        persisted = [];
      }
    }

    const { loadLiveBusinessData } = await import("./business-data");
    const current = toHistoricalBusinessSnapshot(await loadLiveBusinessData());
    if (persisted.length > 0) {
      return combinePersistedAndLiveHistory(persisted, current, query);
    }
    return [current];
  });
}
