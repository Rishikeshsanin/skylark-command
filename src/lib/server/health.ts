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
}

export function getHealthSnapshot(requestId: string): HealthSnapshot {
  const dependencies = {
    mondayTokenConfigured: Boolean(process.env.MONDAY_API_TOKEN),
    dealsBoardConfigured: Boolean(process.env.MONDAY_DEALS_BOARD_ID),
    workOrdersBoardConfigured: Boolean(process.env.MONDAY_WORK_ORDERS_BOARD_ID),
    aiProviderConfigured: Boolean(process.env.AI_API_KEY),
  };

  const coreConfigured =
    dependencies.mondayTokenConfigured &&
    dependencies.dealsBoardConfigured &&
    dependencies.workOrdersBoardConfigured;

  return {
    ok: true,
    status: coreConfigured ? "ok" : "degraded",
    service: "skylark-command",
    timestamp: new Date().toISOString(),
    requestId,
    dependencies,
  };
}
