import { describe, expect, it } from "vitest";
import { applyScenarioOverrides } from "@/lib/agent/v2/scenario-engine";
import type { BusinessDataSnapshot } from "@/lib/business-data";
import { PublicApiError } from "@/lib/server/errors";
import { withWorkspaceDataScope } from "./workspace-scope";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

function emptySnapshot(): BusinessDataSnapshot {
  return {
    deals: [],
    workOrders: [],
    normalizationIssues: [],
    source: {
      provider: "monday.com",
      dealsBoardId: "1",
      workOrdersBoardId: "2",
      dealsBoardName: "Deals",
      workOrdersBoardName: "Work Orders",
      fetchedAt: "2026-08-26T00:00:00.000Z",
    },
  };
}

describe("scenario execution authorization boundary", () => {
  it("rejects an authenticated workspace scenario before overrides execute", async () => {
    try {
      await withWorkspaceDataScope(
        WORKSPACE_ID,
        false,
        async () => applyScenarioOverrides(emptySnapshot(), []),
      );
      throw new Error("Expected scenario authorization to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PublicApiError);
      expect((error as PublicApiError).status).toBe(403);
      expect((error as PublicApiError).code).toBe("SCENARIO_PERMISSION_REQUIRED");
    }
  });

  it("allows scenario computation for an authorized workspace", async () => {
    const result = await withWorkspaceDataScope(
      WORKSPACE_ID,
      true,
      async () => applyScenarioOverrides(emptySnapshot(), []),
    );
    expect(result.snapshot.deals).toEqual([]);
  });

  it("keeps public demo scenarios available without an authenticated workspace scope", async () => {
    const result = await withWorkspaceDataScope(
      undefined,
      false,
      async () => applyScenarioOverrides(emptySnapshot(), []),
    );
    expect(result.snapshot.workOrders).toEqual([]);
  });
});
