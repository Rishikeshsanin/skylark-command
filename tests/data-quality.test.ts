import assert from "node:assert/strict";
import test from "node:test";

import { buildDataQualityReport, buildLeadershipBriefData } from "../src/lib/analytics/index";
import { makeDeal, makeWorkOrder } from "./fixtures";

test("reports unique unmapped clients, malformed rows, stale dates, and duplicate serials", () => {
  const deals = [
    makeDeal({ mondayItemId: "d1", normalizedClientKey: "COMPANY001", tentativeCloseDate: "2026-01-01" }),
    makeDeal({ mondayItemId: "d2", malformed: true }),
  ];
  const workOrders = [
    makeWorkOrder({ mondayItemId: "w1", normalizedClientKey: "COMPANY999", serialNumber: "DUP" }),
    makeWorkOrder({ mondayItemId: "w2", normalizedClientKey: "COMPANY999", serialNumber: "DUP" }),
  ];

  const report = buildDataQualityReport(deals, workOrders, [], "2026-08-25");
  assert.equal(report.malformedDeals, 1);
  assert.equal(report.unmappedWorkOrderClients, 1);
  assert.deepEqual(report.unmappedWorkOrderClientKeys, ["COMPANY999"]);
  assert.equal(report.issues.filter((issue) => issue.code === "unmapped_client").length, 1);
  assert.ok(report.issues.some((issue) => issue.code === "stale_close_date"));
  assert.ok(report.issues.some((issue) => issue.code === "duplicate_serial_number"));
});

test("leadership brief is deterministic for identical inputs", () => {
  const deals = [makeDeal()];
  const workOrders = [makeWorkOrder()];
  const first = buildLeadershipBriefData(deals, workOrders, "2026-08-25");
  const second = buildLeadershipBriefData(deals, workOrders, "2026-08-25");
  assert.deepEqual(first, second);
});
