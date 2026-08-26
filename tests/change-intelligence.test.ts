import assert from "node:assert/strict";
import test from "node:test";

import {
  detectChangeIntelligence,
  interquartileRange,
  median,
  medianAbsoluteDeviation,
  percentile,
  robustZScore,
  summarizeRobustDistribution,
} from "../src/lib/analytics/index";
import type { HistoricalBusinessSnapshot } from "../src/types/index";
import { makeDeal, makeWorkOrder } from "./fixtures";

function snapshot(
  snapshotId: string,
  capturedAt: string,
  deals = [makeDeal()],
  workOrders = [makeWorkOrder()],
): HistoricalBusinessSnapshot {
  return { snapshotId, capturedAt, deals, workOrders, normalizationIssues: [] };
}

test("robust distribution helpers are deterministic", () => {
  const values = [1, 2, 3, 4, 100];
  assert.equal(median(values), 3);
  assert.equal(medianAbsoluteDeviation(values), 1);
  assert.equal(interquartileRange(values), 2);
  assert.equal(percentile(values, 90), 61.6);
  assert.equal(robustZScore(10, [1, 2, 3, 4, 5]), 4.7215);
  assert.deepEqual(summarizeRobustDistribution(values), {
    count: 5,
    median: 3,
    mad: 1,
    q1: 2,
    q3: 4,
    iqr: 2,
    p90: 61.6,
  });
});

test("sparse history creates no synthetic baseline", () => {
  const result = detectChangeIntelligence([
    snapshot("s1", "2026-08-25T10:00:00.000Z"),
  ]);
  assert.equal(result.uniqueSnapshotCount, 1);
  assert.deepEqual(result.signals, []);
  assert.match(result.caveats[0], /at least two distinct historical snapshots/i);
});

test("duplicate snapshot ids are ignored and no-change remains empty", () => {
  const deals = [makeDeal({ mondayItemId: "d1", value: 100 })];
  const workOrders = [makeWorkOrder({ mondayItemId: "w1", amountReceivable: 25 })];
  const s1 = snapshot("s1", "2026-08-24T10:00:00.000Z", deals, workOrders);
  const s2 = snapshot("s2", "2026-08-25T10:00:00.000Z", deals, workOrders);
  const result = detectChangeIntelligence([s1, s2, s2]);
  assert.equal(result.snapshotCount, 3);
  assert.equal(result.uniqueSnapshotCount, 2);
  assert.deepEqual(result.signals, []);
  assert.ok(result.caveats.some((caveat) => /duplicated snapshot/i.test(caveat)));
});

test("pipeline and receivable deltas expose old, new, delta and evidence", () => {
  const before = snapshot(
    "before",
    "2026-08-24T10:00:00.000Z",
    [makeDeal({ mondayItemId: "d1", value: 100, status: "Open" })],
    [makeWorkOrder({ mondayItemId: "w1", amountReceivable: 10 })],
  );
  const after = snapshot(
    "after",
    "2026-08-25T10:00:00.000Z",
    [makeDeal({ mondayItemId: "d1", value: 150, status: "Open" })],
    [makeWorkOrder({ mondayItemId: "w1", amountReceivable: 20 })],
  );
  const result = detectChangeIntelligence([before, after]);
  const pipeline = result.signals.find((signal) => signal.type === "open_pipeline_change");
  const receivables = result.signals.find((signal) => signal.type === "receivables_change");
  assert.ok(pipeline);
  assert.equal(pipeline.oldValue, 100);
  assert.equal(pipeline.newValue, 150);
  assert.equal(pipeline.delta, 50);
  assert.equal(pipeline.percentageDelta, 50);
  assert.deepEqual(pipeline.evidence.dealItemIds, ["d1"]);
  assert.deepEqual(pipeline.sourceSnapshotIds, { from: "before", to: "after" });
  assert.ok(receivables);
  assert.equal(receivables.oldValue, 10);
  assert.equal(receivables.newValue, 20);
  assert.deepEqual(receivables.evidence.workOrderItemIds, ["w1"]);
});

test("record transitions detect won, stage/date movement, stale, delayed and paused with evidence ids", () => {
  const before = snapshot(
    "before",
    "2026-08-15T10:00:00.000Z",
    [
      makeDeal({ mondayItemId: "d1", name: "Alpha", status: "Open", stage: "A", tentativeCloseDate: "2026-09-30" }),
      makeDeal({ mondayItemId: "d2", name: "Stale", status: "Open", stage: "B", tentativeCloseDate: "2026-08-20" }),
    ],
    [
      makeWorkOrder({ mondayItemId: "w1", name: "Delayed", executionStatus: "Ongoing", probableEndDate: "2026-08-20" }),
      makeWorkOrder({ mondayItemId: "w2", name: "Paused", executionStatus: "Ongoing", probableEndDate: "2026-12-31" }),
    ],
  );
  const after = snapshot(
    "after",
    "2026-08-25T10:00:00.000Z",
    [
      makeDeal({ mondayItemId: "d1", name: "Alpha", status: "Won", stage: "B", tentativeCloseDate: "2026-10-31" }),
      makeDeal({ mondayItemId: "d2", name: "Stale", status: "Open", stage: "B", tentativeCloseDate: "2026-08-20" }),
    ],
    [
      makeWorkOrder({ mondayItemId: "w1", name: "Delayed", executionStatus: "Ongoing", probableEndDate: "2026-08-20" }),
      makeWorkOrder({ mondayItemId: "w2", name: "Paused", executionStatus: "Pause / struck", probableEndDate: "2026-12-31" }),
    ],
  );
  const result = detectChangeIntelligence([before, after]);
  const types = new Set(result.signals.map((signal) => signal.type));
  for (const expected of [
    "deal_newly_won",
    "deal_stage_movement",
    "deal_tentative_close_movement",
    "deal_newly_stale",
    "work_order_newly_delayed",
    "work_order_newly_paused",
  ]) assert.ok(types.has(expected as never), `missing ${expected}`);
  assert.ok(result.signals.some((signal) => signal.evidence.dealItemIds.includes("d1")));
  assert.ok(result.signals.some((signal) => signal.evidence.dealItemIds.includes("d2")));
  assert.ok(result.signals.some((signal) => signal.evidence.workOrderItemIds.includes("w1")));
  assert.ok(result.signals.some((signal) => signal.evidence.workOrderItemIds.includes("w2")));
});

test("new large opportunity uses the prior known open-value distribution", () => {
  const priorDeals = [100, 200, 300, 400, 500].map((value, index) =>
    makeDeal({ mondayItemId: `d${index}`, value, status: "Open", normalizedClientKey: `COMPANY00${index}` }),
  );
  const before = snapshot("before", "2026-08-24T10:00:00.000Z", priorDeals, []);
  const after = snapshot(
    "after",
    "2026-08-25T10:00:00.000Z",
    [...priorDeals, makeDeal({ mondayItemId: "new-large", name: "Large", value: 600, status: "Open", normalizedClientKey: "COMPANY999" })],
    [],
  );
  const result = detectChangeIntelligence([before, after]);
  const signal = result.signals.find((item) => item.type === "deal_new_large_opportunity");
  assert.ok(signal);
  assert.equal(signal.evidence.dealItemIds[0], "new-large");
  assert.equal(signal.method.name, "percentile_threshold");
  assert.equal(signal.method.parameters.percentile, 90);
});

test("missing monetary values remain explicit in change completeness", () => {
  const before = snapshot(
    "before",
    "2026-08-24T10:00:00.000Z",
    [
      makeDeal({ mondayItemId: "known", value: 100, status: "Open" }),
      makeDeal({ mondayItemId: "unknown", value: null, status: "Open" }),
    ],
    [],
  );
  const after = snapshot(
    "after",
    "2026-08-25T10:00:00.000Z",
    [
      makeDeal({ mondayItemId: "known", value: 120, status: "Open" }),
      makeDeal({ mondayItemId: "unknown", value: null, status: "Open" }),
    ],
    [],
  );
  const signal = detectChangeIntelligence([before, after]).signals.find(
    (item) => item.type === "open_pipeline_change",
  );
  assert.ok(signal);
  assert.equal(signal.dataCompleteness.knownRecords, 1);
  assert.equal(signal.dataCompleteness.unknownRecords, 1);
  assert.match(signal.dataCompleteness.note, /known values only/i);
});

test("signal ordering is stable regardless of source record order", () => {
  const before = snapshot(
    "before",
    "2026-08-24T10:00:00.000Z",
    [
      makeDeal({ mondayItemId: "d2", name: "B", stage: "A", value: 100 }),
      makeDeal({ mondayItemId: "d1", name: "A", stage: "A", value: 100 }),
    ],
    [],
  );
  const after = snapshot(
    "after",
    "2026-08-25T10:00:00.000Z",
    [
      makeDeal({ mondayItemId: "d1", name: "A", stage: "B", value: 100 }),
      makeDeal({ mondayItemId: "d2", name: "B", stage: "B", value: 100 }),
    ],
    [],
  );
  const stageIds = detectChangeIntelligence([before, after]).signals
    .filter((signal) => signal.type === "deal_stage_movement")
    .map((signal) => signal.affected.entityId);
  assert.deepEqual(stageIds, ["d1", "d2"]);
});
