import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatAmount } from "@/components/ui/formatters";
import { structuredDataLines } from "./structured-data";

const currencyCode = "INR";

function joined(data: unknown) {
  return structuredDataLines(data, currencyCode).join("\n");
}

function rankingData(
  rankingType: "won_value" | "open_pipeline" | "work_order_execution_health" | "combined_importance",
  deterministicBasis: string,
) {
  return {
    rankingType,
    currencyCode,
    entries: [
      {
        rank: 1,
        normalizedClientKey: "COMPANY001",
        deterministicBasis,
        monetaryValues: {
          wonValue: 950,
          openPipelineValue: 688,
          workOrderValueInclGst: 118,
          receivables: 36,
          combinedExposure: 1792,
          knownDealValueRecords: 4,
          unknownDealValueRecords: 1,
        },
        operationalValues: {
          workOrderCount: 3,
          activeWorkOrders: 2,
          delayedWorkOrders: 1,
          pausedWorkOrders: 1,
          arPriorityWorkOrders: 1,
          executionRiskScore: 11,
        },
        caveats: ["One Deal value is missing."],
      },
    ],
    caveats: ["Ranking uses deterministic backend analytics."],
  };
}

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

  it("visibly renders wonValue and pipeline coverage", () => {
    const output = joined({
      openPipelineValue: 688,
      wonValue: 950,
      openDeals: 49,
      wonDeals: 165,
      knownOpenValueDeals: 47,
      unknownOpenValueDeals: 2,
      knownWonValueDeals: 164,
      unknownWonValueDeals: 1,
    });

    expect(output).toContain(`Won value: ${formatAmount(950, currencyCode)}`);
    expect(output).toContain(`Open pipeline value: ${formatAmount(688, currencyCode)}`);
    expect(output).toContain("Open deals: 49");
    expect(output).toContain("Won deals: 165");
    expect(output).toContain("Known open value deals: 47");
    expect(output).toContain("Unknown open value deals: 2");
    expect(output).toContain("Known won value deals: 164");
    expect(output).toContain("Unknown won value deals: 1");
  });

  it("visibly renders receivables and Work Order financial fields", () => {
    const output = joined({
      receivables: 360,
      unknownReceivableCount: 2,
      billedValueInclGst: 500,
      collectedAmountInclGst: 300,
      amountToBeBilledInclGst: 200,
    });

    expect(output).toContain(`Receivables: ${formatAmount(360, currencyCode)}`);
    expect(output).toContain(`Billed value incl Gst: ${formatAmount(500, currencyCode)}`);
    expect(output).toContain(`Collected amount incl Gst: ${formatAmount(300, currencyCode)}`);
    expect(output).toContain(`Amount to be billed incl Gst: ${formatAmount(200, currencyCode)}`);
    expect(output).toContain("Unknown receivable count: 2");
  });

  it.each([
    ["won_value", "Highest won value", "Won value", formatAmount(950, currencyCode)],
    ["open_pipeline", "Largest active pipeline", "Open pipeline value", formatAmount(688, currencyCode)],
    ["work_order_execution_health", "Best project execution", "Execution risk score", "11"],
    ["combined_importance", "Combined commercial + operational importance", "Combined exposure", formatAmount(1792, currencyCode)],
  ] as const)("renders decisive values for %s rankings", (rankingType, basis, decisiveLabel, decisiveValue) => {
    const output = joined(rankingData(rankingType, basis));

    expect(output).toContain("Rank: 1");
    expect(output).toContain("Client: COMPANY001");
    expect(output).toContain(`Basis: ${basis}`);
    expect(output).toContain(`${decisiveLabel}: ${decisiveValue}`);
    expect(output).toContain("Monetary values —");
    expect(output).toContain("Operational values —");
    expect(output).toContain("Caveats — One Deal value is missing.");
    expect(output).not.toContain("{\"");
  });
});

describe("Copilot clarification buttons", () => {
  it("send only the canonical selected option", () => {
    const source = readFileSync(new URL("./founder-copilot.tsx", import.meta.url), "utf8");

    expect(source).toContain("onClick={() => onPrompt(option)}");
    expect(source).not.toContain("Answer: ${option}");
    expect(source).not.toContain("clarification?.question ?? \"Clarification\"");
  });
});
