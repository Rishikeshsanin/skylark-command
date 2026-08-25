import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDealConcentration,
  calculatePipelineMetrics,
  calculateWorkOrderHealth,
  dealCloseQuarterMetrics,
  findRiskyDeals,
  pipelineByStage,
} from "../src/lib/analytics/index";
import { makeDeal, makeWorkOrder } from "./fixtures";

test("pipeline metrics use only deterministic known values", () => {
  const deals = [
    makeDeal({ mondayItemId: "1", value: 100, status: "Open" }),
    makeDeal({ mondayItemId: "2", value: null, status: "Open" }),
    makeDeal({ mondayItemId: "3", value: 300, status: "Won" }),
    makeDeal({ mondayItemId: "4", value: null, status: "Won" }),
    makeDeal({ mondayItemId: "5", value: 50, status: "Dead" }),
  ];

  assert.deepEqual(calculatePipelineMetrics(deals), {
    totalDeals: 5,
    openDeals: 2,
    activeDeals: 2,
    wonDeals: 2,
    deadDeals: 1,
    openPipelineValue: 100,
    wonValue: 300,
    averageOpenDealSize: 100,
    knownOpenValueDeals: 1,
    unknownOpenValueDeals: 1,
    knownWonValueDeals: 1,
    unknownWonValueDeals: 1,
  });
});

test("pipeline metrics handle empty datasets", () => {
  assert.deepEqual(calculatePipelineMetrics([]), {
    totalDeals: 0,
    openDeals: 0,
    activeDeals: 0,
    wonDeals: 0,
    deadDeals: 0,
    openPipelineValue: 0,
    wonValue: 0,
    averageOpenDealSize: null,
    knownOpenValueDeals: 0,
    unknownOpenValueDeals: 0,
    knownWonValueDeals: 0,
    unknownWonValueDeals: 0,
  });
});

test("stage and quarter calculations are deterministic", () => {
  const deals = [
    makeDeal({ mondayItemId: "1", stage: "A", value: 100, tentativeCloseDate: "2026-01-15" }),
    makeDeal({ mondayItemId: "2", stage: "A", value: 50, tentativeCloseDate: "2026-03-15" }),
    makeDeal({ mondayItemId: "3", stage: "B", value: 200, tentativeCloseDate: "2026-04-01" }),
  ];

  assert.deepEqual(pipelineByStage(deals), [
    { stage: "B", dealCount: 1, knownValueDealCount: 1, unknownValueDealCount: 0, totalValue: 200 },
    { stage: "A", dealCount: 2, knownValueDealCount: 2, unknownValueDealCount: 0, totalValue: 150 },
  ]);
  assert.deepEqual(dealCloseQuarterMetrics(deals), [
    { quarter: "Q1 2026", dealCount: 2, knownValueDealCount: 2, totalValue: 150 },
    { quarter: "Q2 2026", dealCount: 1, knownValueDealCount: 1, totalValue: 200 },
  ]);
});

test("risk detection flags stale close dates and held deals", () => {
  const risks = findRiskyDeals([
    makeDeal({ status: "Open", tentativeCloseDate: "2026-01-01" }),
    makeDeal({ mondayItemId: "2", status: "On Hold", tentativeCloseDate: "2026-12-01" }),
  ], "2026-08-25");
  assert.equal(risks.length, 2);
  assert.ok(risks.some((risk) => risk.reasons.includes("tentative close date is in the past")));
  assert.ok(risks.some((risk) => risk.reasons.includes("on hold")));
});

test("deal concentration groups by normalized client", () => {
  const result = calculateDealConcentration([
    makeDeal({ mondayItemId: "1", normalizedClientKey: "COMPANY001", value: 80 }),
    makeDeal({ mondayItemId: "2", normalizedClientKey: "COMPANY001", value: 20 }),
    makeDeal({ mondayItemId: "3", normalizedClientKey: "COMPANY002", value: 100 }),
  ]);
  assert.equal(result.knownOpenPipelineValue, 200);
  assert.equal(result.topClientValue, 100);
  assert.equal(result.topClientShare, 0.5);
});

test("Work Order health classifies statuses and sums billing fields", () => {
  const workOrders = [
    makeWorkOrder({ mondayItemId: "1", executionStatus: "Completed", amountInclGst: 118, billedValueInclGst: 118, collectedAmountInclGst: 100, amountToBeBilledInclGst: 0, amountReceivable: 18 }),
    makeWorkOrder({ mondayItemId: "2", executionStatus: "Not Started", probableStartDate: "2026-01-01", probableEndDate: "2026-12-01", amountInclGst: 236, billedValueInclGst: 0, collectedAmountInclGst: 0, amountToBeBilledInclGst: 236, amountReceivable: 0, arPriority: "Priority" }),
    makeWorkOrder({ mondayItemId: "3", executionStatus: "Pause / struck", probableEndDate: "2026-01-01", amountInclGst: null, amountReceivable: null }),
  ];

  const health = calculateWorkOrderHealth(workOrders, "2026-08-25");
  assert.equal(health.totalWorkOrders, 3);
  assert.equal(health.activeWorkOrders, 2);
  assert.equal(health.completedWorkOrders, 1);
  assert.equal(health.notStartedWorkOrders, 1);
  assert.equal(health.pausedWorkOrders, 1);
  assert.equal(health.delayedWorkOrders, 2);
  assert.equal(health.arPriorityWorkOrders, 1);
  assert.equal(health.totalAmountInclGst, 354);
  assert.equal(health.receivables, 18);
  assert.equal(health.unknownAmountCount, 1);
  assert.equal(health.unknownReceivableCount, 1);
});
