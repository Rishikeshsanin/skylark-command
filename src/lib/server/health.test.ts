import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealthSnapshot } from "./health";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getHealthSnapshot", () => {
  it("reports Gemini configuration as a boolean without revealing credentials", () => {
    vi.stubEnv("MONDAY_API_TOKEN", "monday-super-secret");
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "5030844099");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "5030844103");
    vi.stubEnv("GEMINI_API_KEY", "gemini-super-secret");
    vi.stubEnv("AI_API_KEY", "");

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
    expect(serialized).not.toContain("gemini-super-secret");
  });

  it("recognizes the backward-compatible AI key without exposing it", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("AI_API_KEY", "legacy-super-secret");
    const snapshot = getHealthSnapshot("request-123");
    expect(snapshot.dependencies.aiProviderConfigured).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("legacy-super-secret");
  });

  it("degrades safely when core monday configuration is missing", () => {
    vi.stubEnv("MONDAY_API_TOKEN", "");
    vi.stubEnv("MONDAY_DEALS_BOARD_ID", "");
    vi.stubEnv("MONDAY_WORK_ORDERS_BOARD_ID", "");
    const snapshot = getHealthSnapshot("request-123");
    expect(snapshot.status).toBe("degraded");
  });
});
