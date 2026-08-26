import { describe, expect, it } from "vitest";
import { evaluateAlertConditions } from "./alerts";

describe("evaluateAlertConditions", () => {
  it("activates only threshold-backed reliability conditions", () => {
    const alerts = evaluateAlertConditions({
      consecutiveSyncFailures: 3,
      freshnessAgeMs: 3_700_000,
      staleAfterMs: 3_600_000,
      databaseFailures: 3,
      providerCalls: 10,
      providerFailures: 2,
      apiRequests: 20,
      api5xx: 1,
    });
    expect(alerts.every((alert) => alert.active)).toBe(true);
  });
});
