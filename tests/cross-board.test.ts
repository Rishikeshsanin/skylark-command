import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClientIntelligence,
  calculateSectorMetrics,
  clientsWithOpenDealsAndActiveWorkOrders,
} from "../src/lib/analytics/index";
import { makeDeal, makeWorkOrder } from "./fixtures";

test("joins Deals and Work Orders on normalized client keys", () => {
  const deals = [makeDeal({ normalizedClientKey: "COMPANY002", clientCode: "COMPANY002", value: 500 })];
  const workOrders = [makeWorkOrder({ normalizedClientKey: "COMPANY002", customerCode: "WOCOMPANY_002", amountReceivable: 50 })];
  const clients = buildClientIntelligence(deals, workOrders, "2026-08-25");

  assert.equal(clients.length, 1);
  assert.equal(clients[0].normalizedClientKey, "COMPANY002");
  assert.equal(clients[0].openDealValue, 500);
  assert.equal(clients[0].workOrderCount, 1);
  assert.equal(clients[0].hasCombinedCommercialOperationalRisk, true);
  assert.ok(clients[0].operationalRiskReasons.includes("outstanding receivables"));
});

test("returns only clients with both open deals and active Work Orders", () => {
  const deals = [
    makeDeal({ mondayItemId: "1", normalizedClientKey: "COMPANY001" }),
    makeDeal({ mondayItemId: "2", normalizedClientKey: "COMPANY002" }),
  ];
  const workOrders = [
    makeWorkOrder({ mondayItemId: "w1", normalizedClientKey: "COMPANY001", executionStatus: "Ongoing" }),
    makeWorkOrder({ mondayItemId: "w2", normalizedClientKey: "COMPANY002", executionStatus: "Completed" }),
  ];
  const result = clientsWithOpenDealsAndActiveWorkOrders(deals, workOrders, "2026-08-25");
  assert.deepEqual(result.map((client) => client.normalizedClientKey), ["COMPANY001"]);
});

test("sector metrics combine commercial and operational exposure", () => {
  const metrics = calculateSectorMetrics(
    [makeDeal({ sector: "Mining", value: 100 })],
    [makeWorkOrder({ sector: "Mining", amountInclGst: 118, amountReceivable: 20 })],
  );
  assert.deepEqual(metrics[0], {
    sector: "Mining",
    dealCount: 1,
    openDealCount: 1,
    openPipelineValue: 100,
    wonValue: 0,
    workOrderCount: 1,
    activeWorkOrderCount: 1,
    workOrderValueInclGst: 118,
    receivables: 20,
  });
});
