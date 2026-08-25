import { describe, expect, it, vi } from "vitest";
import type { AnalyticsDispatcher } from "./analytics-adapter";
import { orchestrateFounderQuestion } from "./orchestrator";

const source = {
  provider: "monday.com" as const,
  boardIds: ["deals", "work-orders"],
  fetchedAt: "2026-08-25T00:00:00.000Z",
};

describe("orchestrateFounderQuestion", () => {
  it("returns clarification without invoking analytics", async () => {
    const dispatcher: AnalyticsDispatcher = vi.fn(async () => ({
      result: { data: {}, caveats: [] },
      source,
    }));

    const response = await orchestrateFounderQuestion(
      "Who are our best customers?",
      dispatcher,
    );

    expect(response.ok).toBe(true);
    expect(response.clarification?.required).toBe(true);
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it("passes deterministic analytics data through without recalculating it", async () => {
    const deterministicData = {
      sentinelMetric: 12345,
      nested: { value: 987 },
    };
    const dispatcher: AnalyticsDispatcher = vi.fn(async () => ({
      result: {
        data: deterministicData,
        caveats: ["Source contains missing values."],
      },
      source,
    }));

    const response = await orchestrateFounderQuestion(
      "How is our pipeline looking?",
      dispatcher,
    );

    expect(response.ok).toBe(true);
    expect(response.data).toBe(deterministicData);
    expect(response.caveats).toEqual(["Source contains missing values."]);
    expect(response.source).toEqual(source);
  });
});
