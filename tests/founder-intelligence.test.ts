import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLeadershipBriefData,
  getCurrentQuarter,
  getFounderAttentionFeed,
  getLatestAvailableQuarter,
  getPipelineForCurrentQuarter,
  getPipelineForQuarter,
  getSectorPerformanceForCurrentQuarter,
  getSectorPerformanceForQuarter,
  rankCustomersByCombinedImportance,
  rankCustomersByOpenPipeline,
  rankCustomersByWonValue,
  rankCustomersByWorkOrderExecutionHealth,
} from "../src/lib/analytics/index";
import { makeDeal, makeWorkOrder } from "./fixtures";

test("empty current quarter returns no-data state with latest-period fallback", () => {
  const deals = [
    makeDeal({ mondayItemId: "q2", tentativeCloseDate: "2026-05-15", value: 250, status: "Open" }),
  ];

  assert.equal(getCurrentQuarter("2026-08-25"), "Q3 2026");
  const result = getPipelineForCurrentQuarter(deals, "2026-08-25");
  assert.equal(result.requestedPeriod, "Q3 2026");
  assert.equal(result.hasData, false);
  assert.equal(result.recordsAnalyzed, 0);
  assert.equal(result.result, null);
  assert.equal(result.latestAvailablePeriod, "Q2 2026");
  assert.equal(result.latestAvailableResult?.pipeline.openPipelineValue, 250);
  assert.ok(result.caveats.some((caveat) => caveat.includes("zero is not reported")));
});

test("period pipeline excludes missing close dates and preserves missing monetary values", () => {
  const deals = [
    makeDeal({ mondayItemId: "known", closeDate: "2026-07-20", tentativeCloseDate: null, value: 100 }),
    makeDeal({ mondayItemId: "unknown-value", closeDate: null, tentativeCloseDate: "2026-09-20", value: null }),
    makeDeal({ mondayItemId: "missing-date", closeDate: null, tentativeCloseDate: null, value: 999 }),
  ];

  const result = getPipelineForQuarter(deals, "Q3 2026");
  assert.equal(result.hasData, true);
  assert.equal(result.recordsAnalyzed, 2);
  assert.equal(result.result?.pipeline.openPipelineValue, 100);
  assert.equal(result.result?.pipeline.knownOpenValueDeals, 1);
  assert.equal(result.result?.pipeline.unknownOpenValueDeals, 1);
  assert.ok(result.caveats.some((caveat) => caveat.includes("no usable close/tentative close date")));
});

test("sector performance applies explicit period filter without leaking other quarters", () => {
  const deals = [
    makeDeal({ mondayItemId: "m-q3", sector: "Mining", status: "Open", value: 100, tentativeCloseDate: "2026-07-01" }),
    makeDeal({ mondayItemId: "p-q3", sector: "Powerline", status: "Won", value: 200, tentativeCloseDate: "2026-08-01" }),
    makeDeal({ mondayItemId: "m-q2", sector: "Mining", status: "Open", value: 500, tentativeCloseDate: "2026-05-01" }),
  ];

  const result = getSectorPerformanceForQuarter(deals, "Q3 2026");
  assert.equal(result.recordsAnalyzed, 2);
  assert.equal(result.result?.sectors.length, 2);
  assert.equal(result.result?.sectors.find((row) => row.sector === "Mining")?.openPipelineValue, 100);
  assert.equal(result.result?.sectors.find((row) => row.sector === "Powerline")?.wonValue, 200);
  assert.equal(result.currencyCode, "INR");
  assert.deepEqual(result.provenance, {
    dealRecordsAnalyzed: 2,
    workOrderRecordsAnalyzed: 0,
    totalRecordsAnalyzed: 2,
  });
});

test("sector current-quarter no-data state falls back to latest available quarter", () => {
  const deals = [makeDeal({ tentativeCloseDate: "2026-04-10", sector: "Mining", value: 300 })];
  const result = getSectorPerformanceForCurrentQuarter(deals, "2026-08-25");
  assert.equal(result.hasData, false);
  assert.equal(result.result, null);
  assert.equal(result.latestAvailablePeriod, "Q2 2026");
  assert.equal(result.latestAvailableResult?.recordsAnalyzed, 1);
});

test("latest available quarter ignores records with no usable period date", () => {
  const deals = [
    makeDeal({ mondayItemId: "missing", closeDate: null, tentativeCloseDate: null }),
    makeDeal({ mondayItemId: "q1", tentativeCloseDate: "2026-02-01" }),
    makeDeal({ mondayItemId: "q4", tentativeCloseDate: "2026-11-01" }),
  ];
  assert.equal(getLatestAvailableQuarter(deals), "Q4 2026");
});

test("won-value customer ranking uses competition ties and excludes unmatched customers", () => {
  const deals = [
    makeDeal({ mondayItemId: "a", normalizedClientKey: "COMPANY001", status: "Won", value: 100 }),
    makeDeal({ mondayItemId: "b", normalizedClientKey: "COMPANY002", clientCode: "COMPANY002", status: "Won", value: 100 }),
    makeDeal({ mondayItemId: "u", normalizedClientKey: null, clientCode: null, status: "Won", value: 500 }),
  ];

  const result = rankCustomersByWonValue(deals);
  assert.deepEqual(result.entries.map((entry) => [entry.normalizedClientKey, entry.rank]), [
    ["COMPANY001", 1],
    ["COMPANY002", 1],
  ]);
  assert.equal(result.unmatchedDealRecordsExcluded, 1);
  assert.equal(result.provenance.dealRecordsAnalyzed, 2);
  assert.equal(result.currencyCode, "INR");
  assert.ok(result.caveats.some((caveat) => caveat.includes("no fuzzy match")));
});

test("open-pipeline ranking retains customers whose deal value is missing", () => {
  const result = rankCustomersByOpenPipeline([
    makeDeal({ normalizedClientKey: "COMPANY001", status: "Open", value: null }),
  ]);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.monetaryValues.openPipelineValue, 0);
  assert.equal(result.entries[0]?.monetaryValues.unknownDealValueRecords, 1);
  assert.ok(result.entries[0]?.caveats.some((caveat) => caveat.includes("missing monetary")));
});

test("Work Order execution-health ranking is deterministic and exposes operational basis", () => {
  const workOrders = [
    makeWorkOrder({ mondayItemId: "risk", normalizedClientKey: "COMPANY001", executionStatus: "Pause / struck", probableEndDate: "2026-01-01", amountReceivable: 500 }),
    makeWorkOrder({ mondayItemId: "steady", normalizedClientKey: "COMPANY002", customerCode: "WOCOMPANY_002", executionStatus: "Ongoing", probableEndDate: "2026-12-01", amountReceivable: 50 }),
  ];
  const result = rankCustomersByWorkOrderExecutionHealth(workOrders, "2026-08-25");
  assert.equal(result.entries[0]?.normalizedClientKey, "COMPANY001");
  assert.equal(result.entries[0]?.operationalValues.pausedWorkOrders, 1);
  assert.ok(result.entries[0]?.deterministicBasis.includes("4× delayed"));
});

test("combined customer importance computes exact provenance and monetary exposure", () => {
  const deals = [makeDeal({ normalizedClientKey: "COMPANY001", status: "Open", value: 100 })];
  const workOrders = [makeWorkOrder({ normalizedClientKey: "COMPANY001", amountInclGst: 118, amountReceivable: 20 })];
  const result = rankCustomersByCombinedImportance(deals, workOrders, "2026-08-25");
  assert.equal(result.entries[0]?.monetaryValues.combinedExposure, 238);
  assert.deepEqual(result.provenance, {
    dealRecordsAnalyzed: 1,
    workOrderRecordsAnalyzed: 1,
    totalRecordsAnalyzed: 2,
  });
});

test("founder attention feed orders HIGH before MEDIUM deterministically", () => {
  const deals = [
    makeDeal({ mondayItemId: "deal-a", normalizedClientKey: "COMPANY001", value: 1000, tentativeCloseDate: "2026-12-01" }),
    makeDeal({ mondayItemId: "deal-b", normalizedClientKey: "COMPANY002", clientCode: "COMPANY002", value: 100, tentativeCloseDate: "2026-12-01" }),
  ];
  const workOrders = [
    makeWorkOrder({ mondayItemId: "ar", normalizedClientKey: "COMPANY001", amountReceivable: 1000, arPriority: "Priority", executionStatus: "Ongoing", probableEndDate: "2026-12-01" }),
    makeWorkOrder({ mondayItemId: "paused", normalizedClientKey: "COMPANY002", customerCode: "WOCOMPANY_002", amountReceivable: 0, executionStatus: "Pause / struck", probableEndDate: "2026-12-01" }),
  ];
  const result = getFounderAttentionFeed(deals, workOrders, "2026-08-25");
  const firstMedium = result.items.findIndex((item) => item.severity === "MEDIUM");
  const lastHigh = result.items.map((item) => item.severity).lastIndexOf("HIGH");
  assert.ok(result.items.length > 0);
  assert.equal(result.items[0]?.severity, "HIGH");
  assert.ok(firstMedium === -1 || lastHigh < firstMedium);
  assert.ok(result.items.some((item) => item.recommendedAttentionCategory === "collections"));
  assert.equal(result.currencyCode, "INR");
});

test("Leadership Brief adds INR presentation metadata and non-malformed provenance counts", () => {
  const deals = [makeDeal(), makeDeal({ mondayItemId: "bad-deal", malformed: true })];
  const workOrders = [makeWorkOrder(), makeWorkOrder({ mondayItemId: "bad-wo", malformed: true })];
  const result = buildLeadershipBriefData(deals, workOrders, "2026-08-25");
  assert.equal(result.currencyCode, "INR");
  assert.deepEqual(result.provenance, {
    dealRecordsAnalyzed: 1,
    workOrderRecordsAnalyzed: 1,
    totalRecordsAnalyzed: 2,
  });
});
