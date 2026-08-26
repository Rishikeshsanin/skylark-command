export interface HealthSnapshot {
  ok: true;
  status: "ok" | "degraded";
  service: "skylark-command";
  timestamp: string;
  requestId: string;
  dependencies: {
    mondayTokenConfigured: boolean;
    dealsBoardConfigured: boolean;
    workOrdersBoardConfigured: boolean;
    aiProviderConfigured: boolean;
  };
  platform: {
    databaseConfigured: boolean;
    temporalMode: "live" | "temporal_preferred" | "temporal_only";
    freshness: "live" | "unknown" | "unavailable";
  };
}

export function getHealthSnapshot(requestId: string): HealthSnapshot {
  const dependencies = {
    mondayTokenConfigured: Boolean(process.env.MONDAY_API_TOKEN),
    dealsBoardConfigured: Boolean(process.env.MONDAY_DEALS_BOARD_ID),
    workOrdersBoardConfigured: Boolean(process.env.MONDAY_WORK_ORDERS_BOARD_ID),
    aiProviderConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.AI_API_KEY),
  };
  const temporalMode = process.env.SKYLARK_DATA_MODE === "temporal_only"
    ? "temporal_only" as const
    : process.env.SKYLARK_DATA_MODE === "temporal_preferred"
      ? "temporal_preferred" as const
      : "live" as const;
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const coreConfigured = dependencies.mondayTokenConfigured && dependencies.dealsBoardConfigured && dependencies.workOrdersBoardConfigured;
  const temporalConfigured = temporalMode === "live" || databaseConfigured;

  return {
    ok: true,
    status: coreConfigured && temporalConfigured ? "ok" : "degraded",
    service: "skylark-command",
    timestamp: new Date().toISOString(),
    requestId,
    dependencies,
    platform: {
      databaseConfigured,
      temporalMode,
      freshness: temporalMode === "live" ? "live" : databaseConfigured ? "unknown" : "unavailable",
    },
  };
}
