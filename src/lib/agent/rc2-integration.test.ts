import { describe, expect, it } from "vitest";
import type { BusinessDataSnapshot } from "@/lib/business-data";
import { makeDeal, makeWorkOrder } from "../../../tests/fixtures";
import { executePlanAgainstSnapshot } from "./analytics-adapter";
import { planFounderQuestion } from "./planner";

describe("RC2 integration acceptance", () => {
  it("routes project leadership attention to the deterministic Founder Attention Feed", () => {
    const decision = planFounderQuestion("Which projects need leadership attention?");
    expect(decision.clarification).toBeUndefined();
    expect(decision.plan).toMatchObject({
      intent: "work_order_health",
      focus: "attention",
    });

    const snapshot: BusinessDataSnapshot = {
      deals: [
        makeDeal({
          mondayItemId: "deal-1",
          normalizedClientKey: "COMPANY001",
          status: "Open",
          value: 1_000_000,
          tentativeCloseDate: "2026-07-01",
        }),
      ],
      workOrders: [
        makeWorkOrder({
          mondayItemId: "wo-1",
          normalizedClientKey: "COMPANY001",
          executionStatus: "Ongoing",
          probableEndDate: "2026-07-01",
          amountInclGst: 500_000,
          amountReceivable: 100_000,
        }),
      ],
      normalizationIssues: [],
      source: {
        provider: "monday.com",
        dealsBoardId: "5030844099",
        workOrdersBoardId: "5030844103",
        dealsBoardName: "Skylark Command — Deals",
        workOrdersBoardName: "Skylark Command — Work Orders",
        fetchedAt: "2026-08-25T00:00:00.000Z",
      },
    };

    const result = executePlanAgainstSnapshot(decision.plan!, snapshot);
    const data = result.data as {
      currencyCode: string;
      items: Array<{ title: string; relevantSource: string }>;
    };

    expect(data.currencyCode).toBe("INR");
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items.some((item) => item.relevantSource === "work_orders" || item.relevantSource === "cross_board")).toBe(true);
  });
});
