import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AgentResponse } from "@/types/domain";
import {
  AssistantResponse,
  clarificationOptionsFor,
} from "./founder-copilot";
import {
  buildVisualAnalytics,
  CopilotVisualAnalytics,
} from "./visual-analytics";

const canonicalClarificationOptions = [
  "Highest won value",
  "Largest active pipeline",
  "Best project execution",
  "Combined commercial + operational importance",
];

function agentResponse(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    ok: true,
    answer: "Deterministic analytics completed.",
    caveats: [],
    source: {
      provider: "monday.com",
      boardIds: ["deals", "work-orders"],
      fetchedAt: "2026-08-25T08:00:00.000Z",
    },
    ...overrides,
  };
}

describe("Copilot visual analytics", () => {
  it("preserves supplied customer rank order and decisive deterministic values", () => {
    const sections = buildVisualAnalytics({
      rankingType: "open_pipeline",
      currencyCode: "INR",
      entries: [
        {
          rank: 1,
          normalizedClientKey: "COMPANY047",
          monetaryValues: {
            wonValue: 125,
            openPipelineValue: 900,
            workOrderValueInclGst: 700,
            receivables: 80,
            combinedExposure: 1805,
            knownDealValueRecords: 2,
            unknownDealValueRecords: 1,
          },
          operationalValues: {
            workOrderCount: 3,
            activeWorkOrders: 2,
            delayedWorkOrders: 1,
            pausedWorkOrders: 0,
            executionRiskScore: 6,
          },
        },
        {
          rank: 2,
          normalizedClientKey: "COMPANY009",
          monetaryValues: {
            wonValue: 400,
            openPipelineValue: 650,
            workOrderValueInclGst: 500,
            receivables: 20,
            combinedExposure: 1570,
            knownDealValueRecords: 1,
            unknownDealValueRecords: 0,
          },
          operationalValues: {
            workOrderCount: 14,
            activeWorkOrders: 4,
            delayedWorkOrders: 0,
            pausedWorkOrders: 0,
            executionRiskScore: 4,
          },
        },
      ],
      provenance: {
        dealRecordsAnalyzed: 3,
        workOrderRecordsAnalyzed: 17,
        totalRecordsAnalyzed: 20,
      },
      unmatchedDealRecordsExcluded: 1,
      unmatchedWorkOrderRecordsExcluded: 2,
    }, "INR");

    expect(sections).toHaveLength(1);
    expect(sections[0].chart?.rows.map((row) => row.label)).toEqual([
      "COMPANY047",
      "COMPANY009",
    ]);
    expect(sections[0].chart?.rows.map((row) => row.value)).toEqual([900, 650]);
    expect(sections[0].table?.rows[0].cells).toMatchObject({
      rank: 1,
      client: "COMPANY047",
      openPipeline: 900,
      wonValue: 125,
      workOrderValue: 700,
      receivables: 80,
      combinedExposure: 1805,
      workOrders: "2 / 3",
    });
  });

  it("uses the supplied sector openPipelineValue without replacing it with combined exposure", () => {
    const sections = buildVisualAnalytics([
      {
        sector: "Energy",
        openPipelineValue: 1234567,
        openDealCount: 3,
        dealCount: 5,
        workOrderValueInclGst: 99999999,
        receivables: 25000,
      },
      {
        sector: "Mining",
        openPipelineValue: 765432,
        openDealCount: 2,
        dealCount: 4,
        workOrderValueInclGst: 1,
        receivables: 2,
      },
    ], "INR");

    expect(sections[0].chart?.valueLabel).toBe("Known open pipeline");
    expect(sections[0].chart?.rows.map((row) => row.value)).toEqual([1234567, 765432]);
    expect(sections[0].table?.rows[0].cells.openPipeline).toBe(1234567);
    expect(sections[0].chart?.rows[0].value).not.toBe(101234566);
  });

  it("keeps requested pipeline and operations metrics visible with unknown coverage", () => {
    const pipeline = buildVisualAnalytics({
      openPipelineValue: 688152293.17,
      wonValue: 95038938.98,
      openDeals: 49,
      wonDeals: 165,
      knownOpenValueDeals: 40,
      unknownOpenValueDeals: 9,
      knownWonValueDeals: 64,
      unknownWonValueDeals: 101,
    }, "INR")[0];
    const operations = buildVisualAnalytics({
      receivables: 36291748.87,
      billedValueInclGst: 1000,
      collectedAmountInclGst: 700,
      amountToBeBilledInclGst: 300,
      activeWorkOrders: 12,
      delayedWorkOrders: 3,
      pausedWorkOrders: 2,
      arPriorityWorkOrders: 4,
      unknownReceivableCount: 5,
    }, "INR")[0];

    expect(Object.fromEntries(pipeline.metrics.map((metric) => [metric.label, metric.value]))).toMatchObject({
      "Known open pipeline": 688152293.17,
      "Known won value": 95038938.98,
      "Open deals": 49,
      "Won deals": 165,
    });
    expect(pipeline.metrics.find((metric) => metric.id === "open-pipeline")?.hint).toBe("40 known · 9 unknown values");
    expect(pipeline.metrics.find((metric) => metric.id === "won-value")?.hint).toBe("64 known · 101 unknown values");
    expect(operations.metrics.map((metric) => metric.label)).toEqual([
      "Known receivables",
      "Known billed incl GST",
      "Known collected incl GST",
      "Known to be billed incl GST",
      "Active WOs",
      "Delayed",
      "Paused",
      "AR priority",
    ]);
    expect(operations.metrics[0].hint).toBe("5 records unknown");
  });

  it("renders missing supplied fields explicitly as Unknown and never emits raw JSON", () => {
    const sections = buildVisualAnalytics({
      rankingType: "open_pipeline",
      currencyCode: "INR",
      entries: [
        {
          rank: 1,
          normalizedClientKey: "COMPANY_MISSING",
          monetaryValues: {
            knownDealValueRecords: 0,
            unknownDealValueRecords: 1,
          },
          operationalValues: {},
        },
        {
          rank: 2,
          normalizedClientKey: "COMPANY_KNOWN",
          monetaryValues: {
            openPipelineValue: 500,
            knownDealValueRecords: 1,
            unknownDealValueRecords: 0,
          },
          operationalValues: {},
        },
      ],
    }, "INR");
    const markup = renderToStaticMarkup(
      createElement(CopilotVisualAnalytics, { sections }),
    );

    expect(markup).toContain("Unknown");
    expect(markup).toContain("COMPANY_MISSING");
    expect(markup).not.toContain("{&quot;");
    expect(markup).not.toContain("[{");
  });

  it("adds accessible chart/table labels and mobile-contained markup", () => {
    const sections = buildVisualAnalytics([
      { stage: "Proposal", totalValue: 500000, dealCount: 2, knownValueDealCount: 1, unknownValueDealCount: 1 },
    ], "INR");
    const markup = renderToStaticMarkup(
      createElement(CopilotVisualAnalytics, { sections }),
    );

    expect(markup).toContain("aria-label=\"Pipeline stage chart using supplied total values\"");
    expect(markup).toContain("role=\"region\"");
    expect(markup).toContain("aria-label=\"Pipeline stage exact supplied values\"");
    expect(markup).toContain("class=\"copilot-table-region mobile-safe\"");
  });

  it("keeps no-data periods honest instead of drawing a zero chart", () => {
    const sections = buildVisualAnalytics({
      requestedPeriod: "Q3 2026",
      hasData: false,
      result: null,
      latestAvailablePeriod: "Q2 2026",
      latestAvailableResult: null,
      currencyCode: "INR",
    });

    expect(sections).toHaveLength(1);
    expect(sections[0].notice?.title).toBe("No usable data for this period");
    expect(sections[0].notice?.message).toContain("Zero is not presented as performance");
    expect(sections[0].chart).toBeUndefined();
  });

  it("keeps canonical clarification choices and follow-up questions actionable", () => {
    const clarification = agentResponse({
      answer: "What should best customers mean?",
      clarification: {
        required: true,
        question: "What should best customers mean?",
        reason: "A deterministic basis is required.",
        options: canonicalClarificationOptions,
      },
    });
    expect(clarificationOptionsFor(clarification)).toEqual(canonicalClarificationOptions);
    const clarificationMarkup = renderToStaticMarkup(
      createElement(AssistantResponse, {
        response: clarification,
        onPrompt: () => undefined,
      }),
    );
    for (const option of canonicalClarificationOptions) {
      expect(clarificationMarkup).toContain(`>${option}</button>`);
    }

    const followUp = agentResponse({
      explanation: {
        headline: "Pipeline is grounded",
        executiveSummary: "Supplied values are authoritative.",
        observations: [],
        risks: [],
        attentionItems: [],
        followUpQuestions: ["Show the stage distribution", "Which clients need attention?"],
      },
    });
    const followUpMarkup = renderToStaticMarkup(
      createElement(AssistantResponse, {
        response: followUp,
        onPrompt: () => undefined,
      }),
    );
    expect(followUpMarkup).toContain("Follow-up questions");
    expect(followUpMarkup).toContain(">Show the stage distribution</button>");
    expect(followUpMarkup).toContain(">Which clients need attention?</button>");
  });
});
