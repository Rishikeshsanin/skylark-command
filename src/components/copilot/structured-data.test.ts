import { describe, expect, it } from "vitest";
import { structuredDataLines } from "./structured-data";

describe("structuredDataLines", () => {
  it("renders sector, stage, and risky-deal arrays as useful lines", () => {
    const sectorLines = structuredDataLines([
      { sector: "Mining", openPipelineValue: 1250000, openDealCount: 3 },
    ], "INR");
    const stageLines = structuredDataLines([
      { stage: "Proposal", totalValue: 500000, dealCount: 2 },
    ], "INR");
    const riskLines = structuredDataLines([
      { name: "Project North", value: 900000, status: "Open", reasons: ["Close timing is stale"] },
    ], "INR");

    expect(sectorLines.join(" ")).toContain("Mining");
    expect(sectorLines.join(" ")).toContain("₹");
    expect(sectorLines.join(" ")).toContain("Open Pipeline Value");
    expect(stageLines.join(" ")).toContain("Proposal");
    expect(riskLines.join(" ")).toContain("Close timing is stale");
  });

  it("walks period results and customer ranking entries", () => {
    const period = structuredDataLines({
      requestedPeriod: "Q3 2026",
      hasData: true,
      result: {
        quarter: "Q3 2026",
        sectors: [{ sector: "Energy", openPipelineValue: 750000 }],
      },
    }, "INR");

    expect(period.join(" ")).toContain("Q3 2026");
    expect(period.join(" ")).toContain("Energy");
  });

  it("surfaces Founder Attention and Data Health nested evidence", () => {
    const attention = structuredDataLines({
      currencyCode: "INR",
      items: [
        {
          severity: "HIGH",
          title: "Delayed Work Order needs operating attention",
          entity: "WO-101",
          reason: "The active Work Order is past its probable end date.",
        },
      ],
    }, "INR");
    const health = structuredDataLines({
      totalDeals: 10,
      malformedDeals: 2,
      unmappedWorkOrderClients: 1,
      unmappedWorkOrderClientKeys: ["COMPANY042"],
      issues: [{ severity: "error", message: "Deal value is malformed" }],
    });

    expect(attention.join(" ")).toContain("WO-101");
    expect(attention.join(" ")).toContain("HIGH");
    expect(health.join(" ")).toContain("Deal value is malformed");
  });

  it("guarantees requested pipeline and receivables metrics are visible with completeness language", () => {
    const pipeline = structuredDataLines({
      openPipelineValue: 688152293.17,
      wonValue: 95038938.98,
      openDeals: 49,
      wonDeals: 165,
      knownOpenValueDeals: 40,
      unknownOpenValueDeals: 9,
      knownWonValueDeals: 64,
      unknownWonValueDeals: 101,
      averageOpenDealSize: 100,
    }, "INR").join(" ");
    const receivables = structuredDataLines({
      receivables: 36291748.87,
      unknownReceivableCount: 5,
      billedValueInclGst: 1000,
      collectedAmountInclGst: 700,
      amountToBeBilledInclGst: 300,
    }, "INR").join(" ");

    expect(pipeline).toContain("Known won value");
    expect(pipeline).toContain("₹9,50,38,938.98");
    expect(pipeline).toContain("64 known");
    expect(pipeline).toContain("101 unknown");
    expect(pipeline).toContain("Known open pipeline value");
    expect(receivables).toContain("Known receivables");
    expect(receivables).toContain("₹3,62,91,748.87");
    expect(receivables).toContain("Unknown receivable records: 5");
    expect(receivables).toContain("Known billing incl GST");
    expect(receivables).toContain("Known collections incl GST");
    expect(receivables).toContain("Known amount to be billed incl GST");
  });

  it.each([
    "won_value",
    "open_pipeline",
    "work_order_execution_health",
    "combined_importance",
  ])("renders decisive supplied values for %s customer ranking", (rankingType) => {
    const lines = structuredDataLines({
      rankingType,
      currencyCode: "INR",
      entries: [
        {
          rank: 1,
          normalizedClientKey: "COMPANY001",
          deterministicBasis: "Deterministic evaluator basis.",
          monetaryValues: {
            wonValue: 100,
            openPipelineValue: 200,
            workOrderValueInclGst: 300,
            receivables: 40,
            combinedExposure: 640,
            knownDealValueRecords: 3,
            unknownDealValueRecords: 2,
          },
          operationalValues: {
            activeWorkOrders: 4,
            delayedWorkOrders: 1,
            pausedWorkOrders: 2,
            executionRiskScore: 15,
          },
          caveats: ["Two contributing deal records have missing monetary values."],
        },
      ],
      caveats: ["Ranking uses deterministic supplied values only."],
    }, "INR").join(" ");

    expect(lines).toContain("Rank 1");
    expect(lines).toContain("COMPANY001");
    expect(lines).toContain("Basis: Deterministic evaluator basis.");
    expect(lines).toContain("Known won value");
    expect(lines).toContain("Known open pipeline value");
    expect(lines).toContain("Work Order value incl GST");
    expect(lines).toContain("Known receivables");
    expect(lines).toContain("Combined exposure");
    expect(lines).toContain("Known records: 3");
    expect(lines).toContain("Unknown records: 2");
    expect(lines).toContain("Active Work Orders: 4");
    expect(lines).toContain("Delayed: 1");
    expect(lines).toContain("Paused: 2");
    expect(lines).toContain("Execution risk score: 15");
    expect(lines).toContain("missing monetary values");
  });

  it("renders unique cross-board client semantics without raw JSON", () => {
    const lines = structuredDataLines({
      totalUniqueWorkOrderClientKeys: 51,
      matchedUniqueWorkOrderClientKeys: 50,
      unmatchedUniqueWorkOrderClientKeys: 1,
      unmatchedWorkOrderClientKeys: ["COMPANY042"],
      matchedClients: [
        { normalizedClientKey: "COMPANY001", dealCount: 2, workOrderCount: 3 },
      ],
    }).join(" ");

    expect(lines).toContain("Unique Work Order client keys: 51");
    expect(lines).toContain("Matched unique Work Order client keys: 50");
    expect(lines).toContain("Unmatched unique Work Order client keys: 1");
    expect(lines).toContain("COMPANY042");
    expect(lines).not.toContain("{");
  });
});
