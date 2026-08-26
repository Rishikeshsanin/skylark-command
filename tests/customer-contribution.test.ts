import assert from "node:assert/strict";
import test from "node:test";

import { calculateCustomerContribution } from "../src/lib/analytics/customer-contribution";
import { makeDeal } from "./fixtures";

const deals = [
  makeDeal({ mondayItemId: "D1", normalizedClientKey: "COMPANY001", clientCode: "COMPANY001", status: "Open", sector: "Energy", stage: "Proposal", value: 20_000_000, tentativeCloseDate: "2026-09-30" }),
  makeDeal({ mondayItemId: "D2", normalizedClientKey: "COMPANY002", clientCode: "COMPANY002", status: "Open", sector: "Energy", stage: "Proposal", value: 10_000_000, tentativeCloseDate: "2026-09-15" }),
  makeDeal({ mondayItemId: "D3", normalizedClientKey: "COMPANY001", clientCode: "COMPANY001", status: "Open", sector: "Mining", stage: "Lead", value: 5_000_000, tentativeCloseDate: "2026-12-15" }),
  makeDeal({ mondayItemId: "D4", normalizedClientKey: "COMPANY003", clientCode: "COMPANY003", status: "Open", sector: "Energy", stage: "Proposal", value: null, tentativeCloseDate: "2026-09-10" }),
  makeDeal({ mondayItemId: "D5", normalizedClientKey: "COMPANY001", clientCode: "COMPANY001", status: "Won", sector: "Energy", stage: "Won", value: 50_000_000, closeDate: "2026-06-20" }),
  makeDeal({ mondayItemId: "D6", normalizedClientKey: null, clientCode: null, status: "Open", sector: "Energy", stage: "Proposal", value: 5_000_000, tentativeCloseDate: "2026-09-05" }),
];

test("customer contribution supports sector and stage scoped open pipeline", () => {
  const sector = calculateCustomerContribution(deals, { sector: "Energy" });
  assert.equal(sector.metricId, "open_pipeline_value");
  assert.deepEqual(sector.recordsIncluded, ["D1", "D2", "D4", "D6"]);
  assert.equal(sector.coverage.knownFilteredValue, 35_000_000);
  assert.equal(sector.coverage.unknownValueDealCount, 1);
  assert.deepEqual(sector.customers.map((row) => row.normalizedClientKey), ["COMPANY001", "COMPANY002", "COMPANY003"]);
  assert.equal(sector.customers[0].knownValueContribution, 20_000_000);
  assert.equal(sector.customers[0].shareOfKnownFilteredValue, 0.57);
  assert.equal(sector.customers[2].knownValueContribution, null);
  assert.equal(sector.customers[2].rank, null);

  const stage = calculateCustomerContribution(deals, { stage: "Lead" });
  assert.deepEqual(stage.recordsIncluded, ["D3"]);
  assert.equal(stage.customers[0].normalizedClientKey, "COMPANY001");
  assert.equal(stage.customers[0].knownValueContribution, 5_000_000);
});

test("value thresholds are deterministic and unknown values never become zero", () => {
  const result = calculateCustomerContribution(deals, {
    sector: "Energy",
    minDealValue: 10_000_000,
    maxDealValue: 20_000_000,
  });
  assert.deepEqual(result.recordsIncluded, ["D1", "D2"]);
  assert.equal(result.coverage.knownValueDealCount, 2);
  assert.equal(result.coverage.unknownValueDealCount, 0);
  assert.equal(result.coverage.valueThresholdUnknownDealCount, 1);
  assert.ok(result.recordsExcluded.find((record) => record.mondayItemId === "D4")?.reasons.includes("unknown Deal value cannot satisfy explicit value threshold"));
  assert.equal(result.customers[0].knownValueContribution, 20_000_000);
  assert.equal(result.customers[1].knownValueContribution, 10_000_000);
});

test("open contribution excludes won deals unless the won semantic metric is explicit", () => {
  const open = calculateCustomerContribution(deals, { sector: "Energy" });
  assert.ok(!open.recordsIncluded.includes("D5"));

  const won = calculateCustomerContribution(deals, {
    metricId: "known_won_value",
    status: "Won",
    sector: "Energy",
  });
  assert.deepEqual(won.recordsIncluded, ["D5"]);
  assert.equal(won.customers[0].knownValueContribution, 50_000_000);
  assert.throws(
    () => calculateCustomerContribution(deals, { metricId: "open_pipeline_value", status: "Won" }),
    /conflicts/,
  );
});

test("ties use stable competition ranking and deterministic normalized-key ordering", () => {
  const tied = calculateCustomerContribution([
    makeDeal({ mondayItemId: "B", normalizedClientKey: "COMPANY002", clientCode: "COMPANY002", value: 10_000_000, status: "Open" }),
    makeDeal({ mondayItemId: "A", normalizedClientKey: "COMPANY001", clientCode: "COMPANY001", value: 10_000_000, status: "Open" }),
    makeDeal({ mondayItemId: "C", normalizedClientKey: "COMPANY003", clientCode: "COMPANY003", value: 5_000_000, status: "Open" }),
  ]);
  assert.deepEqual(tied.customers.map((row) => [row.normalizedClientKey, row.rank]), [
    ["COMPANY001", 1],
    ["COMPANY002", 1],
    ["COMPANY003", 3],
  ]);
});

test("zero known monetary coverage keeps shares undefined without fabricating amounts", () => {
  const result = calculateCustomerContribution([
    makeDeal({ mondayItemId: "A", normalizedClientKey: "COMPANY001", clientCode: "COMPANY001", status: "Open", value: 0 }),
    makeDeal({ mondayItemId: "B", normalizedClientKey: "COMPANY002", clientCode: "COMPANY002", status: "Open", value: 0 }),
  ]);
  assert.equal(result.coverage.knownFilteredValue, 0);
  assert.equal(result.coverage.knownValueDealCount, 2);
  assert.deepEqual(result.customers.map((row) => row.knownValueContribution), [0, 0]);
  assert.ok(result.customers.every((row) => row.shareOfKnownFilteredValue === null));
  assert.match(result.caveats.join(" "), /total is zero/);
});

test("all-unknown monetary scope is reported as unknown and remains unranked", () => {
  const result = calculateCustomerContribution([
    makeDeal({ mondayItemId: "A", normalizedClientKey: "COMPANY001", clientCode: "COMPANY001", status: "Open", value: null }),
    makeDeal({ mondayItemId: "B", normalizedClientKey: "COMPANY002", clientCode: "COMPANY002", status: "Open", value: null }),
  ]);
  assert.equal(result.coverage.knownFilteredValue, null);
  assert.equal(result.coverage.knownValueDealCount, 0);
  assert.equal(result.coverage.unknownValueDealCount, 2);
  assert.ok(result.customers.every((row) => row.knownValueContribution === null && row.rank === null));
});

test("customer filter uses the existing exact normalization and never fuzzy matches", () => {
  const result = calculateCustomerContribution(deals, { customerKey: "WOCOMPANY_001" });
  assert.equal(result.scope.customerKey, "COMPANY001");
  assert.deepEqual(result.customers.map((row) => row.normalizedClientKey), ["COMPANY001"]);
  assert.deepEqual(result.recordsIncluded, ["D1", "D3"]);
  assert.equal(result.customerIdentity.matchType, "exact");
  assert.equal(result.customerIdentity.fuzzyMatchingAllowed, false);
});

test("nonexistent combined grounded scope returns explicit no-data rather than a fake customer", () => {
  const result = calculateCustomerContribution(deals, { sector: "Energy", stage: "Lead" });
  assert.equal(result.coverage.scopedDealCount, 0);
  assert.deepEqual(result.customers, []);
  assert.equal(result.coverage.knownFilteredValue, null);
  assert.match(result.caveats.join(" "), /No Deal records matched/);
});

test("evidence IDs and follow-up metadata are derived only from included source records", () => {
  const result = calculateCustomerContribution(deals, { sector: "Energy", dealIds: ["D2", "D1"] });
  assert.deepEqual(result.recordsIncluded, ["D1", "D2"]);
  assert.deepEqual(result.evidenceIds, ["D1", "D2"]);
  assert.deepEqual(result.customers[0].evidenceIds, ["D1"]);
  assert.deepEqual(result.customers[0].followUp.supportedActions, [
    "customer_360",
    "work_orders",
    "receivables",
    "compare_customer_contributions",
  ]);
});
