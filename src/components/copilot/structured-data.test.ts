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
    const ranking = structuredDataLines({
      rankingType: "open_pipeline",
      entries: [{ rank: 1, normalizedClientKey: "COMPANY001", openPipelineValue: 1000000 }],
    }, "INR");

    expect(period.join(" ")).toContain("Q3 2026");
    expect(period.join(" ")).toContain("Energy");
    expect(ranking.join(" ")).toContain("COMPANY001");
    expect(ranking.join(" ")).toContain("Rank: 1");
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
      issues: [{ severity: "error", message: "Deal value is malformed" }],
    });

    expect(attention.join(" ")).toContain("WO-101");
    expect(attention.join(" ")).toContain("HIGH");
    expect(health.join(" ")).toContain("Deal value is malformed");
  });
});
