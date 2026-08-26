import type {
  HistoricalSnapshotOrder,
  ListSuccessfulSnapshotsInput,
} from "./contracts";

export const DEFAULT_HISTORY_LIMIT = 50;
export const MAX_HISTORY_LIMIT = 100;

export interface NormalizedSuccessfulSnapshotQuery {
  workspaceKey: string;
  fromSnapshotTime: string | null;
  toSnapshotTime: string | null;
  limit: number;
  order: HistoricalSnapshotOrder;
}

function normalizeTimestamp(value: string | undefined, field: string): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid timestamp.`);
  return new Date(parsed).toISOString();
}

export function normalizeSuccessfulSnapshotQuery(
  input: ListSuccessfulSnapshotsInput,
): NormalizedSuccessfulSnapshotQuery {
  const workspaceKey = input.workspaceKey.trim();
  if (!workspaceKey) throw new Error("workspaceKey is required for historical snapshot enumeration.");

  const fromSnapshotTime = normalizeTimestamp(input.fromSnapshotTime, "fromSnapshotTime");
  const toSnapshotTime = normalizeTimestamp(input.toSnapshotTime, "toSnapshotTime");
  if (
    fromSnapshotTime &&
    toSnapshotTime &&
    Date.parse(fromSnapshotTime) > Date.parse(toSnapshotTime)
  ) {
    throw new Error("fromSnapshotTime must be before or equal to toSnapshotTime.");
  }

  const requestedLimit = input.limit ?? DEFAULT_HISTORY_LIMIT;
  if (!Number.isFinite(requestedLimit) || requestedLimit <= 0) {
    throw new Error("Historical snapshot limit must be a positive number.");
  }
  const limit = Math.min(MAX_HISTORY_LIMIT, Math.max(1, Math.floor(requestedLimit)));
  const order: HistoricalSnapshotOrder = input.order === "desc" ? "desc" : "asc";

  return {
    workspaceKey,
    fromSnapshotTime,
    toSnapshotTime,
    limit,
    order,
  };
}
