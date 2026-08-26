import "server-only";

import { observeOperation } from "./telemetry";

const DEFAULT_WORKSPACE_KEY = "skylark-command";
const DEFAULT_STALE_AFTER_MINUTES = 60;

function staleAfterMs(): number {
  const configured = Number(process.env.SKYLARK_STALE_AFTER_MINUTES);
  const minutes = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_STALE_AFTER_MINUTES;
  return minutes * 60 * 1000;
}

export interface InternalDiagnostics {
  application: "ok";
  monday: "configured" | "not_configured";
  database: "ok" | "error" | "not_configured";
  aiProvider: "configured" | "not_configured";
  temporalMode: "live" | "temporal_preferred" | "temporal_only";
  freshness: {
    state: "fresh" | "stale" | "syncing" | "failed" | "live" | "unknown";
    ageMs: number | null;
    staleAfterMs: number;
    lastSyncStartedAt: string | null;
    lastSyncSucceededAt: string | null;
    servedSnapshotAt: string | null;
    sourceWatermark: string | null;
  };
}

export async function getInternalDiagnostics(): Promise<InternalDiagnostics> {
  const temporalMode = process.env.SKYLARK_DATA_MODE === "temporal_only"
    ? "temporal_only" as const
    : process.env.SKYLARK_DATA_MODE === "temporal_preferred"
      ? "temporal_preferred" as const
      : "live" as const;
  const mondayConfigured = Boolean(process.env.MONDAY_API_TOKEN && process.env.MONDAY_DEALS_BOARD_ID && process.env.MONDAY_WORK_ORDERS_BOARD_ID);
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const thresholdMs = staleAfterMs();
  const base: InternalDiagnostics = {
    application: "ok",
    monday: mondayConfigured ? "configured" : "not_configured",
    database: databaseConfigured ? "error" : "not_configured",
    aiProvider: process.env.GEMINI_API_KEY || process.env.AI_API_KEY ? "configured" : "not_configured",
    temporalMode,
    freshness: {
      state: temporalMode === "live" ? "live" : "unknown",
      ageMs: null,
      staleAfterMs: thresholdMs,
      lastSyncStartedAt: null,
      lastSyncSucceededAt: null,
      servedSnapshotAt: null,
      sourceWatermark: null,
    },
  };
  if (!databaseConfigured) return base;

  try {
    const { getTemporalSql, createPostgresTemporalSnapshotStore } = await import("@/lib/data-platform/postgres");
    await observeOperation("database.health_probe", { operation: "database_health_probe" }, async () => {
      await getTemporalSql()`SELECT 1 AS ok`;
    });
    base.database = "ok";
    if (temporalMode !== "live") {
      const workspaceKey = process.env.SKYLARK_WORKSPACE_KEY?.trim() ?? DEFAULT_WORKSPACE_KEY;
      const now = new Date();
      const freshness = await observeOperation("database.health_freshness", { operation: "read_freshness", workspaceKey }, () =>
        createPostgresTemporalSnapshotStore().getFreshness({
          workspaceKey,
          now: now.toISOString(),
          staleAfterMs: thresholdMs,
        }),
      );
      const reference = freshness.servedSnapshotAt ?? freshness.lastSyncSucceededAt;
      base.freshness = {
        ...freshness,
        ageMs: reference ? Math.max(0, now.getTime() - Date.parse(reference)) : null,
        staleAfterMs: thresholdMs,
      };
    }
  } catch {
    base.database = "error";
  }
  return base;
}
