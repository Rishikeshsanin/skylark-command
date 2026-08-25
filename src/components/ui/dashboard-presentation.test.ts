import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DataQualityIssue, PipelineMetrics, WorkOrderHealth } from "@/types/domain";
import { DataHealthDashboard } from "@/components/data-health/data-health-dashboard";
import { OperationsDashboard } from "@/components/operations/operations-dashboard";
import { PipelineDashboard } from "@/components/pipeline/pipeline-dashboard";

const pipeline: PipelineMetrics = {
  totalDeals: 346,
  openDeals: 49,
  activeDeals: 51,
  wonDeals: 165,
  deadDeals: 130,
  openPipelineValue: 688_152_293.17,
  wonValue: 95_038_938.98,
  averageOpenDealSize: 14_641_538.15,
  knownOpenValueDeals: 47,
  unknownOpenValueDeals: 2,
  knownWonValueDeals: 64,
  unknownWonValueDeals: 101,
};

const workOrders: WorkOrderHealth = {
  totalWorkOrders: 176,
  activeWorkOrders: 55,
  completedWorkOrders: 117,
  ongoingWorkOrders: 39,
  notStartedWorkOrders: 11,
  pausedWorkOrders: 4,
  delayedWorkOrders: 48,
  arPriorityWorkOrders: 10,
  totalAmountInclGst: 250_000_000,
  billedValueInclGst: 127_000_000,
  amountToBeBilledInclGst: 123_000_000,
  collectedAmountInclGst: 90_708_251.13,
  receivables: 36_291_748.87,
  unknownAmountCount: 0,
  unknownReceivableCount: 0,
  executionStatusDistribution: { Completed: 117, Ongoing: 39 },
  invoiceStatusDistribution: {},
  billingStatusDistribution: { "Update Required": 12, Unknown: 148 },
};

describe("dashboard presentation contracts", () => {
  it("keeps won/open coverage and authoritative INR values visible on Pipeline", () => {
    const html = renderToStaticMarkup(createElement(PipelineDashboard, {
      metrics: pipeline,
      stages: [],
      sectors: [],
      risks: [],
      largestDeals: [],
      quarters: [],
      currency: "INR",
    }));

    expect(html).toContain("Known open pipeline");
    expect(html).toContain("Exact ₹68,81,52,293.17");
    expect(html).toContain("Known won value");
    expect(html).toContain("Exact ₹9,50,38,938.98");
    expect(html).toContain("64 of 165 won deals have known values; 101 are excluded from known won value.");
    expect(html).toContain("Open-deal value coverage: 47 known, 2 unknown.");
  });

  it("renders Operations cash values as supplied and discloses receivable coverage", () => {
    const html = renderToStaticMarkup(createElement(OperationsDashboard, {
      health: workOrders,
      sectors: [],
      currency: "INR",
    }));

    expect(html).toContain("Known receivables");
    expect(html).toContain("Exact ₹3,62,91,748.87");
    expect(html).toContain("No Work Orders have unknown receivable values.");
    expect(html).toContain("the visual does not derive financial totals");
  });

  it("initially limits Data Health notices while preserving severity filters", () => {
    const issues: DataQualityIssue[] = Array.from({ length: 30 }, (_, index) => ({
      code: `issue_${index + 1}`,
      severity: index === 0 ? "error" : "warning",
      entityType: "deal",
      entityId: String(index + 1),
      message: `Quality issue ${index + 1}`,
    }));
    const html = renderToStaticMarkup(createElement(DataHealthDashboard, {
      report: {
        totalDeals: 346,
        totalWorkOrders: 176,
        malformedDeals: 2,
        malformedWorkOrders: 0,
        unmappedWorkOrderClients: 1,
        unmappedWorkOrderClientKeys: ["COMPANY042"],
        issueCounts: { info: 0, warning: 29, error: 1 },
        issues,
      },
    }));

    expect(html).toContain("Data trust flow");
    expect(html).toContain("COMPANY042");
    expect(html).toContain('aria-label="Filter quality notices by severity"');
    expect(html).toContain("Quality issue 24");
    expect(html).not.toContain("Quality issue 25");
    expect(html).toContain("Show more notices");
  });
});
