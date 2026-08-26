import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ChangeIntelligenceResult, Customer360 } from "@/types";
import { ChangeDetective } from "@/components/change-intelligence/change-detective";
import { Customer360View } from "@/components/customers/customer-360";
import { DistributionDonut } from "./distribution-donut";
import { StackedValueBar } from "./stacked-value-bar";
import { TrendChart } from "./trend-chart";
import { WaterfallChart } from "./waterfall-chart";

describe("V2 visualization system", () => {
  it("keeps exact supplied composition values visible without creating a percentage KPI", () => {
    const html = renderToStaticMarkup(createElement(StackedValueBar, {
      ariaLabel: "Supplied billing position",
      formattedTotal: "₹25,00,00,000",
      totalLabel: "Known WO value",
      segments: [
        { label: "Billed", value: 127_000_000, formattedValue: "₹12,70,00,000", tone: "info" },
        { label: "To be billed", value: 123_000_000, formattedValue: "₹12,30,00,000", tone: "warning" },
      ],
    }));

    expect(html).toContain("Supplied billing position. Billed: ₹12,70,00,000, To be billed: ₹12,30,00,000");
    expect(html).toContain("₹25,00,00,000");
    expect(html).not.toContain("%");
  });

  it("renders a small supplied category set as an accessible donut with exact counts", () => {
    const html = renderToStaticMarkup(createElement(DistributionDonut, {
      ariaLabel: "Quality issue severity distribution",
      centerLabel: "notices",
      centerValue: "30",
      items: [
        { label: "Errors", value: 1, formattedValue: "1", tone: "critical" },
        { label: "Warnings", value: 29, formattedValue: "29", tone: "warning" },
        { label: "Information", value: 0, formattedValue: "0", tone: "info" },
      ],
    }));

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Quality issue severity distribution"');
    expect(html).toContain("Errors");
    expect(html).toContain(">29<");
    expect(html).toContain(">0<");
  });

  it("preserves supplied chronological order and exact values in trend accessibility text", () => {
    const html = renderToStaticMarkup(createElement(TrendChart, {
      ariaLabel: "Customer receivables history",
      labels: ["2026-08-20", "2026-08-21", "2026-08-22"],
      series: [{
        label: "Receivables",
        tone: "warning",
        values: [
          { value: 30, formattedValue: "₹30" },
          { value: 10, formattedValue: "₹10" },
          { value: 20, formattedValue: "₹20" },
        ],
      }],
    }));

    expect(html).toContain("2026-08-20 ₹30, 2026-08-21 ₹10, 2026-08-22 ₹20");
    expect(html).toContain('aria-label="Receivables, 2026-08-21: ₹10"');
    expect(html.indexOf("2026-08-20 ₹30")).toBeLessThan(html.indexOf("2026-08-21 ₹10"));
  });

  it("shows an honest empty state instead of fabricating a one-point trend", () => {
    const html = renderToStaticMarkup(createElement(TrendChart, {
      ariaLabel: "Sparse trend",
      labels: ["2026-08-22"],
      series: [{ label: "Pipeline", values: [{ value: 100, formattedValue: "₹100" }] }],
    }));

    expect(html).toContain("Historical trend not available");
    expect(html).not.toContain("trend-line");
  });

  it("renders the three authoritative waterfall values without replacing exact text", () => {
    const html = renderToStaticMarkup(createElement(WaterfallChart, {
      ariaLabel: "Open pipeline movement",
      oldValue: 720_000_000,
      newValue: 680_000_000,
      delta: -40_000_000,
      formattedOld: "₹72,00,00,000",
      formattedNew: "₹68,00,00,000",
      formattedDelta: "-₹4,00,00,000",
    }));

    expect(html).toContain("Previous: ₹72,00,00,000");
    expect(html).toContain("Change: -₹4,00,00,000");
    expect(html).toContain("Current: ₹68,00,00,000");
    expect(html).toContain("waterfall-critical");
  });

  it("adds a waterfall only for a numeric Change Detective signal", () => {
    const result: ChangeIntelligenceResult = {
      snapshotCount: 2,
      uniqueSnapshotCount: 2,
      fromSnapshotId: "before",
      toSnapshotId: "after",
      timeWindow: { from: "2026-08-20T00:00:00.000Z", to: "2026-08-21T00:00:00.000Z" },
      caveats: ["Deterministic comparison."],
      signals: [{
        id: "pipeline-change",
        type: "open_pipeline_change",
        title: "Open pipeline changed materially",
        whatChanged: "Known open pipeline decreased.",
        direction: "decrease",
        metric: "knownOpenPipelineValue",
        oldValue: 720_000_000,
        newValue: 680_000_000,
        delta: -40_000_000,
        percentageDelta: -5.56,
        timeWindow: { from: "2026-08-20T00:00:00.000Z", to: "2026-08-21T00:00:00.000Z" },
        method: { name: "absolute_delta", description: "Supplied deterministic delta.", parameters: {} },
        evidence: { dealItemIds: ["deal-1"], workOrderItemIds: [] },
        dataCompleteness: { knownRecords: 47, unknownRecords: 2, note: "Unknowns excluded." },
        sourceSnapshotIds: { from: "before", to: "after" },
        affected: { customer: null, sector: null, entityId: null, entityName: null },
      }],
    };
    const html = renderToStaticMarkup(createElement(ChangeDetective, { result }));

    expect(html).toContain("waterfall-chart");
    expect(html).toContain("₹72,00,00,000");
    expect(html).toContain("-₹4,00,00,000");
    expect(html).toContain("₹68,00,00,000");
    expect(html).toContain("47 known · 2 unknown");
  });

  it("renders Customer 360 trends from supplied snapshot history and retains the exact table", () => {
    const customer: Customer360 = {
      normalizedClientKey: "COMPANY047",
      commercial: {
        openDeals: [], wonDeals: [], allDeals: [],
        knownOpenPipelineValue: 20, knownWonValue: 40,
        dealStages: [], knownDealValueRecords: 0, unknownDealValueRecords: 0,
      },
      operations: {
        workOrders: [], totalWorkOrders: 0, activeWorkOrders: 0,
        completedWorkOrders: 0, delayedWorkOrders: 0, pausedWorkOrders: 0,
        executionStatusDistribution: {},
      },
      cash: {
        knownWorkOrderValueInclGst: 80, billedValueInclGst: 70,
        collectedAmountInclGst: 50, receivables: 20,
        amountToBeBilledInclGst: 10, arPriorityWorkOrders: 0,
        unknownWorkOrderValueRecords: 0, unknownReceivableRecords: 0,
      },
      trust: {
        matchedAcrossBoards: false,
        joinEvidence: { dealItemIds: [], workOrderItemIds: [] },
        dataQualityIssues: [], knownDealValueRecords: 0, unknownDealValueRecords: 0,
        knownWorkOrderValueRecords: 0, unknownWorkOrderValueRecords: 0,
        knownReceivableRecords: 0, unknownReceivableRecords: 0,
        caveats: ["Exact canonical customer key."],
      },
      attention: { founderAttentionItems: [], changeSignals: [] },
      history: [
        { snapshotId: "s1", capturedAt: "2026-08-20T00:00:00.000Z", openDeals: 1, wonDeals: 1, knownOpenPipelineValue: 10, knownWonValue: 30, activeWorkOrders: 1, delayedWorkOrders: 0, receivables: 15, billedValueInclGst: 60, collectedAmountInclGst: 45 },
        { snapshotId: "s2", capturedAt: "2026-08-21T00:00:00.000Z", openDeals: 2, wonDeals: 1, knownOpenPipelineValue: 20, knownWonValue: 40, activeWorkOrders: 1, delayedWorkOrders: 1, receivables: 20, billedValueInclGst: 70, collectedAmountInclGst: 50 },
      ],
    };
    const html = renderToStaticMarkup(createElement(Customer360View, { customer }));

    expect(html).toContain('aria-label="Commercial value history for COMPANY047"');
    expect(html).toContain('aria-label="Cash history for COMPANY047"');
    expect(html).toContain('aria-label="Exact Customer 360 snapshot history table"');
    expect(html).toContain("s1");
    expect(html).toContain("s2");
    expect(html).not.toContain("Only one distinct snapshot");
  });

  it("includes phone fallbacks and reduced-motion handling in the chart stylesheet", () => {
    const css = readFileSync(new URL("../../app/visualization-system.css", import.meta.url), "utf8");
    expect(css).toContain("@media (max-width: 680px)");
    expect(css).toContain("@media (max-width: 420px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("grid-template-columns: minmax(0, 1fr)");
  });
});
