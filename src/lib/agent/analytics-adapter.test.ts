import { describe, expect, it } from "vitest";
import type { BusinessDataSnapshot } from "@/lib/business-data";
import { makeDeal, makeWorkOrder } from "../../../tests/fixtures";
import { executePlanAgainstSnapshot } from "./analytics-adapter";

function snapshot(
  deals: BusinessDataSnapshot["deals"],
  workOrders: BusinessDataSnapshot["workOrders"] = [],
): BusinessDataSnapshot {
  return {
    deals,
    workOrders,
    normalizationIssues: [],
    source: {
      provider: "monday.com",
      dealsBoardId: "deals",
      workOrdersBoardId: "work-orders",
      dealsBoardName: "Deals",
      workOrdersBoardName: "Work Orders",
      fetchedAt: "2026-08-25T00:00:00.000Z",
    },
  };
}

describe("Agent 1 founder-intelligence adapter wiring", () => {
  it("uses canonical current-quarter pipeline no-data semantics instead of zero", () => {
    const result = executePlanAgainstSnapshot(
      {
        intent: "pipeline_overview",
        period: "current_quarter",
        confidence: 1,
      },
      snapshot([
        makeDeal({
          mondayItemId: "older",
          status: "Open",
          value: 250,
          tentativeCloseDate: "2026-05-15",
        }),
      ]),
    );

    const data = result.data as {
      hasData: boolean;
      result: unknown;
      latestAvailablePeriod: string | null;
    };
    expect(data.hasData).toBe(false);
    expect(data.result).toBeNull();
    expect(data.latestAvailablePeriod).toBe("Q2 2026");
    expect(result.caveats.some((caveat) => caveat.includes("zero"))).toBe(true);
  });

  it("uses Agent 1 period-sector analytics and filters only the requested label", () => {
    const result = executePlanAgainstSnapshot(
      {
        intent: "pipeline_by_sector",
        sector: "Mining",
        quarter: "Q3 2026",
        confidence: 1,
      },
      snapshot([
        makeDeal({ sector: "Mining", value: 100, tentativeCloseDate: "2026-07-01" }),
        makeDeal({ mondayItemId: "power", sector: "Powerline", value: 200, tentativeCloseDate: "2026-08-01" }),
      ]),
    );

    const data = result.data as {
      result: { sectors: Array<{ sector: string; openPipelineValue: number }> } | null;
    };
    expect(data.result?.sectors).toEqual([
      expect.objectContaining({ sector: "Mining", openPipelineValue: 100 }),
    ]);
  });

  it("uses Agent 1 deterministic customer-ranking exports after clarification", () => {
    const result = executePlanAgainstSnapshot(
      {
        intent: "client_cross_board",
        focus: "customer_combined",
        confidence: 1,
      },
      snapshot(
        [makeDeal({ normalizedClientKey: "COMPANY001", value: 100 })],
        [
          makeWorkOrder({
            normalizedClientKey: "COMPANY001",
            amountInclGst: 118,
            amountReceivable: 20,
          }),
        ],
      ),
    );

    const data = result.data as {
      rankingType: string;
      entries: Array<{ normalizedClientKey: string }>;
    };
    expect(data.rankingType).toBe("combined_importance");
    expect(data.entries[0]?.normalizedClientKey).toBe("COMPANY001");
  });
});
