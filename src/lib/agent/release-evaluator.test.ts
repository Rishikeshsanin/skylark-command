import { describe, expect, it } from "vitest";
import { executePlanAgainstSnapshot } from "./analytics-adapter";
import { planFounderQuestion } from "./planner";
import type { BusinessDataSnapshot } from "@/lib/business-data";

function requirePlan(question: string) {
  const decision = planFounderQuestion(question);
  expect(decision.clarification).toBeUndefined();
  expect(decision.plan).toBeDefined();
  return decision.plan!;
}

function emptySnapshot(): BusinessDataSnapshot {
  return {
    deals: [],
    workOrders: [],
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
}

describe("release evaluator prompt contract", () => {
  it.each([
    ["How is our pipeline looking?", "pipeline_overview"],
    ["What should I know about receivables?", "receivables"],
    ["Which customers appear in both boards?", "client_cross_board"],
    ["How are we doing this quarter?", "quarter_analysis"],
    ["Prepare a leadership brief.", "leadership_brief"],
  ] as const)("maps %s to %s", (question, intent) => {
    expect(requirePlan(question).intent).toBe(intent);
  });

  it("treats 'Which sector has the largest open opportunity?' as a sector ranking, not a sector named Which", () => {
    const plan = requirePlan("Which sector has the largest open opportunity?");
    expect(plan.intent).toBe("pipeline_by_sector");
    expect(plan.sector).toBeUndefined();
  });

  it("routes trustworthiness wording to data health", () => {
    const plan = requirePlan("What data should I not trust?");
    expect(plan.intent).toBe("data_health");
  });

  it("executes a supported sector + current-quarter request without a scope-wiring error", () => {
    const plan = requirePlan("How is the energy sector performing this quarter?");
    expect(plan).toMatchObject({
      intent: "pipeline_by_sector",
      sector: "energy",
      period: "current_quarter",
    });

    expect(() => executePlanAgainstSnapshot(plan, emptySnapshot())).not.toThrow();
  });

  it("does not offer a customer-ranking clarification choice that dead-ends in analytics", () => {
    const initial = planFounderQuestion("Who are our best customers?");
    const combinedChoice = initial.clarification?.options?.find((option) =>
      option.toLowerCase().includes("combined commercial"),
    );

    expect(combinedChoice).toBeDefined();
    const plan = requirePlan(combinedChoice!);
    expect(plan).toMatchObject({
      intent: "client_cross_board",
      focus: "customer_combined",
    });

    expect(() => executePlanAgainstSnapshot(plan, emptySnapshot())).not.toThrow();
  });
});
