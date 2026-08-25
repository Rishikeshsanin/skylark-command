import { describe, expect, it } from "vitest";
import type { BusinessDataSnapshot } from "@/lib/business-data";
import type { CustomerRankingResult, SectorMetrics } from "@/types";
import { makeDeal, makeWorkOrder } from "../../../tests/fixtures";
import {
  executePlanAgainstSnapshot,
  type AnalyticsDispatcher,
} from "./analytics-adapter";
import { orchestrateFounderQuestion } from "./orchestrator";
import { planFounderQuestion } from "./planner";

const source = {
  provider: "monday.com" as const,
  boardIds: ["5030844099", "5030844103"],
  fetchedAt: "2026-08-25T00:00:00.000Z",
};

function snapshot(): BusinessDataSnapshot {
  return {
    deals: [
      makeDeal({
        mondayItemId: "d-won-known",
        normalizedClientKey: "COMPANY001",
        clientCode: "COMPANY001",
        status: "Won",
        value: 500,
        sector: "Mining",
        closeDate: "2026-08-01",
        tentativeCloseDate: null,
      }),
      makeDeal({
        mondayItemId: "d-won-unknown",
        normalizedClientKey: "COMPANY001",
        clientCode: "COMPANY001",
        status: "Won",
        value: null,
        sector: "Mining",
        closeDate: "2026-08-10",
        tentativeCloseDate: null,
      }),
      makeDeal({
        mondayItemId: "d-energy",
        normalizedClientKey: "COMPANY002",
        clientCode: "COMPANY002",
        status: "Open",
        value: 900,
        sector: "Energy",
        tentativeCloseDate: "2026-09-15",
      }),
      makeDeal({
        mondayItemId: "d-mining",
        normalizedClientKey: "COMPANY003",
        clientCode: "COMPANY003",
        status: "Open",
        value: 700,
        sector: "Mining",
        tentativeCloseDate: "2026-09-20",
      }),
      makeDeal({
        mondayItemId: "d-logistics",
        normalizedClientKey: "COMPANY004",
        clientCode: "COMPANY004",
        status: "Open",
        value: 100,
        sector: "Logistics",
        tentativeCloseDate: "2026-09-25",
      }),
    ],
    workOrders: [
      makeWorkOrder({
        mondayItemId: "wo-company1",
        normalizedClientKey: "COMPANY001",
        customerCode: "WOCOMPANY_001",
        amountInclGst: 1000,
        amountReceivable: 100,
      }),
      makeWorkOrder({
        mondayItemId: "wo-company2",
        normalizedClientKey: "COMPANY002",
        customerCode: "WOCOMPANY_002",
        executionStatus: "Pause / struck",
        probableEndDate: "2026-01-01",
        amountInclGst: 500,
        amountReceivable: 80,
      }),
      makeWorkOrder({
        mondayItemId: "wo-logistics",
        normalizedClientKey: "COMPANY004",
        customerCode: "WOCOMPANY_004",
        sector: "Logistics",
        amountInclGst: 10000,
        amountReceivable: 0,
      }),
      makeWorkOrder({
        mondayItemId: "wo-unmatched-1",
        normalizedClientKey: "COMPANY042",
        customerCode: "WOCOMPANY_042",
      }),
      makeWorkOrder({
        mondayItemId: "wo-unmatched-2",
        normalizedClientKey: "COMPANY042",
        customerCode: "WOCOMPANY_042",
        serialNumber: "WO-42-2",
      }),
    ],
    normalizationIssues: [],
    source: {
      provider: "monday.com",
      dealsBoardId: "5030844099",
      workOrdersBoardId: "5030844103",
      dealsBoardName: "Skylark Command — Deals",
      workOrdersBoardName: "Skylark Command — Work Orders",
      fetchedAt: source.fetchedAt,
    },
  };
}

function requirePlan(question: string) {
  const decision = planFounderQuestion(question);
  expect(decision.clarification).toBeUndefined();
  expect(decision.plan).toBeDefined();
  return decision.plan!;
}

const rankingCases = [
  ["Highest won value", "customer_won_value", "won_value"],
  ["Largest active pipeline", "customer_pipeline", "open_pipeline"],
  ["Best project execution", "customer_execution", "work_order_execution_health"],
  ["Combined commercial + operational importance", "customer_combined", "combined_importance"],
] as const;

describe("RC3 evaluator hotfix", () => {
  it.each(rankingCases)(
    "accepts exact, Answer:, and exact UI composite payload for %s",
    async (option, focus, rankingType) => {
      const initial = planFounderQuestion("Who are our best customers?");
      const clarificationQuestion = initial.clarification?.question;
      expect(clarificationQuestion).toBeDefined();
      expect(initial.clarification?.options).toContain(option);

      for (const payload of [
        option,
        `Answer: ${option}`,
        `${clarificationQuestion} Answer: ${option}`,
      ]) {
        const plan = requirePlan(payload);
        expect(plan).toMatchObject({ intent: "client_cross_board", focus });
      }

      const dispatcher: AnalyticsDispatcher = async (plan) => ({
        result: executePlanAgainstSnapshot(plan, snapshot()),
        source,
      });
      const response = await orchestrateFounderQuestion(
        `${clarificationQuestion} Answer: ${option}`,
        dispatcher,
        null,
        "rc3-e2e",
      );
      expect(response.ok).toBe(true);
      expect(response.clarification).toBeUndefined();
      expect((response.data as CustomerRankingResult).rankingType).toBe(rankingType);
      expect((response.data as CustomerRankingResult).entries.length).toBeGreaterThan(0);
    },
  );

  it.each([
    "Which sector has the largest open opportunity?",
    "Which sector has the biggest pipeline?",
    "What sector has the most open opportunity?",
  ])("orders %s strictly by known open pipeline value", (question) => {
    const plan = requirePlan(question);
    expect(plan).toMatchObject({
      intent: "pipeline_by_sector",
      focus: "sector_open_pipeline",
    });
    const result = executePlanAgainstSnapshot(plan, snapshot());
    const sectors = result.data as SectorMetrics[];
    expect(sectors[0].sector).toBe("Energy");
    expect(sectors[0].openPipelineValue).toBe(900);
    expect(sectors.find((item) => item.sector === "Logistics")?.workOrderValueInclGst).toBe(10000);
  });

  it("uses unique exact normalized keys for 'customers in both boards'", () => {
    const plan = requirePlan("Which customers appear in both boards?");
    expect(plan).toMatchObject({
      intent: "client_cross_board",
      focus: "cross_board_presence",
    });
    const result = executePlanAgainstSnapshot(plan, snapshot());
    expect(result.data).toMatchObject({
      totalUniqueWorkOrderClientKeys: 4,
      matchedUniqueWorkOrderClientKeys: 3,
      unmatchedUniqueWorkOrderClientKeys: 1,
      unmatchedWorkOrderClientKeys: ["COMPANY042"],
    });
  });

  it("keeps other blocked evaluator prompts on deterministic paths", () => {
    expect(requirePlan("What data should I not trust?").intent).toBe("data_health");
    expect(requirePlan("Mining sector this quarter")).toMatchObject({
      intent: "pipeline_by_sector",
      sector: "Mining",
      period: "current_quarter",
    });
    expect(requirePlan("Which projects need leadership attention?")).toMatchObject({
      intent: "work_order_health",
      focus: "attention",
    });

    expect(() =>
      executePlanAgainstSnapshot(
        requirePlan("Mining sector this quarter"),
        snapshot(),
      ),
    ).not.toThrow();
    const attention = executePlanAgainstSnapshot(
      requirePlan("Which projects need leadership attention?"),
      snapshot(),
    );
    expect(attention.data).toBeDefined();
  });
});
