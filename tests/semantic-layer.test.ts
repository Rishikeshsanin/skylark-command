import assert from "node:assert/strict";
import test from "node:test";

import type { BusinessDataSnapshot } from "../src/lib/business-data";
import {
  CANONICAL_QUESTIONS,
  CLIENT_EXACT_JOIN_ID,
  SEMANTIC_DIMENSIONS,
  SEMANTIC_METRICS,
  assessEvidenceQuality,
  buildAnswerLineage,
  executeCanonicalQuestion,
  getJoinDefinition,
  validateMetricDimensions,
} from "../src/lib/semantic/index";
import { makeDeal, makeWorkOrder } from "./fixtures";

function snapshot(overrides: Partial<BusinessDataSnapshot> = {}): BusinessDataSnapshot {
  return {
    deals: [],
    workOrders: [],
    normalizationIssues: [],
    source: {
      provider: "monday.com",
      dealsBoardId: "deals-board",
      workOrdersBoardId: "work-orders-board",
      dealsBoardName: "Deals",
      workOrdersBoardName: "Work Orders",
      fetchedAt: "2026-08-25T10:00:00.000Z",
    },
    ...overrides,
  };
}

test("semantic metric registry has unique stable ids and semantic versions", () => {
  const metrics = Object.values(SEMANTIC_METRICS);
  assert.equal(metrics.length, 10);
  assert.equal(new Set(metrics.map((metric) => metric.id)).size, metrics.length);
  for (const metric of metrics) {
    assert.match(metric.semanticVersion, /^\d+\.\d+\.\d+$/);
    assert.equal(metric.id, SEMANTIC_METRICS[metric.id].id);
    assert.ok(metric.canonicalAnalytics.length > 0);
    assert.ok(metric.canonicalField.length > 0);
  }
});

test("semantic dimensions are explicit and metric dimension validation is fail-closed", () => {
  assert.deepEqual(Object.keys(SEMANTIC_DIMENSIONS).sort(), [
    "billing_status",
    "client",
    "collection_status",
    "quarter",
    "sector",
    "stage",
    "status",
    "work_order_status",
  ]);
  assert.deepEqual(validateMetricDimensions("open_pipeline_value", ["sector", "stage"]), {
    valid: true,
    invalid: [],
  });
  assert.deepEqual(validateMetricDimensions("open_pipeline_value", ["billing_status"]), {
    valid: false,
    invalid: ["billing_status"],
  });
});

test("metric definitions preserve canonical null and known-unknown coverage semantics", () => {
  const pipeline = SEMANTIC_METRICS.open_pipeline_value;
  const won = SEMANTIC_METRICS.known_won_value;
  const receivables = SEMANTIC_METRICS.receivables;
  assert.equal(pipeline.coverageSemantics.tracked, true);
  assert.match(pipeline.nullSemantics, /null value/i);
  assert.match(won.description, /not a claim of complete historical revenue/i);
  assert.match(receivables.coverageSemantics.unknown, /excluded from the sum/i);
  assert.equal(SEMANTIC_METRICS.open_deal_count.coverageSemantics.tracked, false);
});

test("answer lineage exposes included, excluded, and known-unknown Deal records without recalculating values", () => {
  const data = snapshot({
    deals: [
      makeDeal({ mondayItemId: "open-known", status: "Open", value: 100 }),
      makeDeal({ mondayItemId: "open-unknown", status: "Open", value: null }),
      makeDeal({ mondayItemId: "won", status: "Won", value: 300 }),
      makeDeal({ mondayItemId: "malformed", status: "Open", value: 50, malformed: true }),
    ],
  });
  const lineage = buildAnswerLineage({
    metricIds: ["open_pipeline_value", "open_deal_count"],
    snapshot: data,
    analysisTimestamp: "2026-08-25T10:05:00.000Z",
    filters: [{ dimension: "status", operator: "eq", values: ["Open"] }],
  });
  const valueLineage = lineage.metricRecords.find((metric) => metric.metricId === "open_pipeline_value");
  assert.deepEqual(valueLineage?.recordsIncluded.map((record) => record.id).sort(), ["open-known", "open-unknown"]);
  assert.equal(valueLineage?.knownValueCount, 1);
  assert.equal(valueLineage?.unknownValueCount, 1);
  assert.ok(valueLineage?.recordsExcluded.some((record) => record.id === "malformed" && record.reasons.includes("malformed source record")));
  assert.equal(lineage.semanticVersions.open_pipeline_value, "1.0.0");
  assert.equal(lineage.sourceBoards.length, 2);
});

test("Work Order lineage reports monetary unknown coverage independently for each canonical field", () => {
  const data = snapshot({
    workOrders: [
      makeWorkOrder({ mondayItemId: "known", amountReceivable: 25, amountInclGst: 118 }),
      makeWorkOrder({ mondayItemId: "unknown", amountReceivable: null, amountInclGst: null }),
    ],
  });
  const lineage = buildAnswerLineage({
    metricIds: ["receivables", "total_work_order_value"],
    snapshot: data,
    analysisTimestamp: "2026-08-25T10:10:00.000Z",
  });
  for (const metric of lineage.metricRecords) {
    assert.equal(metric.knownValueCount, 1);
    assert.equal(metric.unknownValueCount, 1);
  }
});

test("join registry requires exact normalized client equality and explicitly forbids fuzzy business joins", () => {
  const join = getJoinDefinition(CLIENT_EXACT_JOIN_ID);
  assert.equal(join.matchType, "exact");
  assert.equal(join.leftKey, "normalizedClientKey");
  assert.equal(join.rightKey, "normalizedClientKey");
  assert.equal(join.fuzzyMatchingAllowed, false);
  assert.match(join.normalization, /WOCOMPANY_002/);
  assert.match(join.unmatchedSemantics, /No fuzzy/i);
});

test("evidence quality is deterministic, descriptive, and explains limiting factors", () => {
  const data = snapshot({
    deals: [
      makeDeal({ mondayItemId: "known", status: "Open", value: 100, normalizedClientKey: "COMPANY001" }),
      makeDeal({ mondayItemId: "unknown", status: "Open", value: null, normalizedClientKey: "COMPANY002" }),
    ],
    workOrders: [
      makeWorkOrder({ mondayItemId: "wo-1", normalizedClientKey: "COMPANY001" }),
      makeWorkOrder({ mondayItemId: "wo-2", normalizedClientKey: "COMPANY999" }),
    ],
  });
  const lineage = buildAnswerLineage({
    metricIds: ["open_pipeline_value"],
    snapshot: data,
    analysisTimestamp: "2026-08-27T12:00:00.000Z",
    joinIds: [CLIENT_EXACT_JOIN_ID],
  });
  const quality = assessEvidenceQuality({
    lineage,
    sourceQualityIssues: { info: 0, warning: 2, error: 0 },
    temporalCoverage: {
      requested: true,
      covered: true,
      partial: true,
      reason: "Only part of the requested historical range is represented.",
    },
  });
  assert.equal(quality.status, "Limited");
  assert.equal(quality.policyVersion, "1.0.0");
  assert.ok(quality.factors.some((factor) => factor.id === "completeness" && factor.status === "Limited"));
  assert.ok(quality.factors.some((factor) => factor.id === "freshness" && factor.status === "Limited"));
  assert.ok(quality.factors.some((factor) => factor.id === "join_coverage" && factor.status === "Limited"));
  assert.ok(quality.reasons.length >= 3);
});

test("verified canonical questions invoke existing deterministic analytics and expose trust lineage", () => {
  const data = snapshot({
    deals: [
      makeDeal({ mondayItemId: "mining", sector: "Mining", status: "Open", value: 100 }),
      makeDeal({ mondayItemId: "tender", sector: "Tender", status: "Open", value: 500 }),
      makeDeal({ mondayItemId: "won", status: "Won", value: 300 }),
      makeDeal({ mondayItemId: "won-unknown", status: "Won", value: null }),
    ],
    workOrders: [
      makeWorkOrder({ mondayItemId: "wo-known", amountReceivable: 29 }),
      makeWorkOrder({ mondayItemId: "wo-unknown", amountReceivable: null }),
    ],
  });
  const at = "2026-08-25T10:05:00.000Z";

  const open = executeCanonicalQuestion("open_pipeline", data, at);
  assert.deepEqual(open.metricValues.map((metric) => [metric.metricId, metric.value]), [
    ["open_pipeline_value", 600],
    ["open_deal_count", 2],
  ]);

  const won = executeCanonicalQuestion("won_value", data, at);
  assert.deepEqual(won.metricValues.map((metric) => [metric.metricId, metric.value]), [
    ["known_won_value", 300],
    ["won_deal_count", 2],
  ]);
  assert.equal(won.lineage.metricRecords[0].unknownValueCount, 1);

  const receivables = executeCanonicalQuestion("receivables", data, at);
  assert.equal(receivables.metricValues[0].value, 29);
  assert.equal(receivables.lineage.metricRecords[0].unknownValueCount, 1);

  const sector = executeCanonicalQuestion("largest_open_sector", data, at);
  assert.equal(sector.metricValues[0].value, 500);
  assert.equal(sector.metricValues[0].dimensions?.sector, "Tender");
  assert.equal(sector.trust.kind, "semantic_trust");
  assert.match(sector.trust.deterministicBoundary, /does not calculate business metrics/i);

  assert.equal(CANONICAL_QUESTIONS.largest_open_sector.plan.focus, "sector_open_pipeline");
});
