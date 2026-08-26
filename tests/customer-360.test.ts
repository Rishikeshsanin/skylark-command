import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCustomer360,
  detectChangeIntelligence,
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

test("Customer 360 joins only exact canonical normalized client keys", () => {
  const current = snapshot(
    "current",
    "2026-08-25T10:00:00.000Z",
    [
      makeDeal({ mondayItemId: "d1", normalizedClientKey: "COMPANY001", value: 100, status: "Open" }),
      makeDeal({ mondayItemId: "d2", normalizedClientKey: "COMPANY001", value: 200, status: "Won" }),
      makeDeal({ mondayItemId: "d-near", normalizedClientKey: "COMPANY01", value: 999, status: "Open" }),
    ],
    [
      makeWorkOrder({ mondayItemId: "w1", normalizedClientKey: "COMPANY001", amountInclGst: 118, amountReceivable: 29 }),
      makeWorkOrder({ mondayItemId: "w-near", normalizedClientKey: "COMPANY01", amountInclGst: 999, amountReceivable: 999 }),
    ],
  );

  const customer = buildCustomer360("COMPANY001", current);
  assert.ok(customer);
  assert.equal(customer.commercial.allDeals.length, 2);
  assert.equal(customer.operations.workOrders.length, 1);
  assert.equal(customer.commercial.knownOpenPipelineValue, 100);
  assert.equal(customer.commercial.knownWonValue, 200);
  assert.equal(customer.cash.knownWorkOrderValueInclGst, 118);
  assert.equal(customer.cash.receivables, 29);
  assert.deepEqual(customer.trust.joinEvidence.dealItemIds, ["d1", "d2"]);
  assert.deepEqual(customer.trust.joinEvidence.workOrderItemIds, ["w1"]);
  assert.equal(customer.trust.matchedAcrossBoards, true);
  assert.ok(customer.trust.caveats.some((caveat) => /no fuzzy matching/i.test(caveat)));
});

test("Customer 360 returns null instead of fuzzy matching an unknown key", () => {
  const current = snapshot(
    "current",
    "2026-08-25T10:00:00.000Z",
    [makeDeal({ normalizedClientKey: "COMPANY001" })],
    [makeWorkOrder({ normalizedClientKey: "COMPANY001" })],
  );
  assert.equal(buildCustomer360("COMPANY0001", current), null);
});

test("Customer 360 preserves known/unknown monetary coverage and data-quality evidence", () => {
  const current = snapshot(
    "current",
    "2026-08-25T10:00:00.000Z",
    [
      makeDeal({ mondayItemId: "d1", normalizedClientKey: "COMPANY001", value: 100 }),
      makeDeal({ mondayItemId: "d2", normalizedClientKey: "COMPANY001", value: null }),
    ],
    [
      makeWorkOrder({ mondayItemId: "w1", normalizedClientKey: "COMPANY001", amountInclGst: 118, amountReceivable: 29 }),
      makeWorkOrder({ mondayItemId: "w2", normalizedClientKey: "COMPANY001", amountInclGst: null, amountReceivable: null }),
    ],
  );
  current.normalizationIssues = [
    {
      code: "MISSING_VALUE",
      severity: "warning",
      entityType: "deal",
      entityId: "d2",
      field: "value",
      message: "Missing Deal value",
    },
    {
      code: "OTHER_CUSTOMER",
      severity: "warning",
      entityType: "deal",
      entityId: "not-this-customer",
      message: "Should not be included",
    },
  ];

  const customer = buildCustomer360("COMPANY001", current);
  assert.ok(customer);
  assert.equal(customer.trust.knownDealValueRecords, 1);
  assert.equal(customer.trust.unknownDealValueRecords, 1);
  assert.equal(customer.trust.knownWorkOrderValueRecords, 1);
  assert.equal(customer.trust.unknownWorkOrderValueRecords, 1);
  assert.equal(customer.trust.knownReceivableRecords, 1);
  assert.equal(customer.trust.unknownReceivableRecords, 1);
  assert.deepEqual(customer.trust.dataQualityIssues.map((issue) => issue.entityId), ["d2"]);
});

test("Customer 360 builds deterministic history and attaches matching change signals", () => {
  const before = snapshot(
    "before",
    "2026-08-24T10:00:00.000Z",
    [makeDeal({ mondayItemId: "d1", normalizedClientKey: "COMPANY001", value: 100, status: "Open" })],
    [makeWorkOrder({ mondayItemId: "w1", normalizedClientKey: "COMPANY001", amountReceivable: 10 })],
  );
  const after = snapshot(
    "after",
    "2026-08-25T10:00:00.000Z",
    [makeDeal({ mondayItemId: "d1", normalizedClientKey: "COMPANY001", value: 150, status: "Open" })],
    [makeWorkOrder({ mondayItemId: "w1", normalizedClientKey: "COMPANY001", amountReceivable: 20 })],
  );
  const changes = detectChangeIntelligence([after, before, after]);
  const customer = buildCustomer360(
    "COMPANY001",
    after,
    [after, before, after],
    null,
    changes.signals,
  );
  assert.ok(customer);
  assert.deepEqual(customer.history.map((point) => point.snapshotId), ["before", "after"]);
  assert.equal(customer.history[0].knownOpenPipelineValue, 100);
  assert.equal(customer.history[1].knownOpenPipelineValue, 150);
  assert.ok(customer.attention.changeSignals.some((signal) => signal.type === "customer_exposure_change"));
});

test("Customer 360 orders Deal and Work Order evidence deterministically", () => {
  const current = snapshot(
    "current",
    "2026-08-25T10:00:00.000Z",
    [
      makeDeal({ mondayItemId: "d2", normalizedClientKey: "COMPANY001" }),
      makeDeal({ mondayItemId: "d1", normalizedClientKey: "COMPANY001" }),
    ],
    [
      makeWorkOrder({ mondayItemId: "w2", normalizedClientKey: "COMPANY001" }),
      makeWorkOrder({ mondayItemId: "w1", normalizedClientKey: "COMPANY001" }),
    ],
  );
  const customer = buildCustomer360("COMPANY001", current);
  assert.ok(customer);
  assert.deepEqual(customer.trust.joinEvidence.dealItemIds, ["d1", "d2"]);
  assert.deepEqual(customer.trust.joinEvidence.workOrderItemIds, ["w1", "w2"]);
});
