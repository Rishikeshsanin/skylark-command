import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealthSnapshot } from "./health";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getHealthSnapshot", () => {
  it("reports configuration booleans without revealing credential values", () => {
    vi.stubEnv("MONDAY_API_TOKEN", "monday-super-secret");
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "5030844099");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "5030844103");
    vi.stubEnv("AI_API_KEY", "ai-super-secret");

    const snapshot = getHealthSnapshot("request-123");
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.dependencies).toEqual({
      mondayTokenConfigured: true,
      dealsBoardConfigured: true,
      workOrdersBoardConfigured: true,
      aiProviderConfigured: true,
    });
    expect(serialized).not.toContain("monday-super-secret");
    expect(serialized).not.toContain("ai-super-secret");
  });

  it("degrades safely when core monday configuration is missing", () => {
    vi.stubEnv("MONDAY_API_TOKEN", "");
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "");
    const snapshot = getHealthSnapshot("request-123");
    expect(snapshot.status).toBe("degraded");
  });
});
