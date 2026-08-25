import assert from "node:assert/strict";
import test from "node:test";

import { DEAL_COLUMN_IDS, WORK_ORDER_COLUMN_IDS } from "../src/lib/monday/columns";
import type { MondayItem } from "../src/lib/monday/types";
import {
  normalizeClientCode,
  normalizeDealItem,
  normalizeWorkOrderItem,
  parseIsoDate,
  parseNullableNumber,
} from "../src/lib/normalization/index";

function item(id: string, name: string, values: Record<string, string>): MondayItem {
  return {
    id,
    name,
    column_values: Object.entries(values).map(([columnId, text]) => ({
      id: columnId,
      type: "text",
      text,
      value: JSON.stringify(text),
    })),
  };
}

test("normalizes cross-board client codes without guessing unrelated formats", () => {
  assert.equal(normalizeClientCode("WOCOMPANY_002"), "COMPANY002");
  assert.equal(normalizeClientCode("company-2"), "COMPANY002");
  assert.equal(normalizeClientCode(" Acme-01 "), "ACME-01");
  assert.equal(normalizeClientCode(null), null);
});

test("parses valid numeric input and rejects malformed values", () => {
  assert.deepEqual(parseNullableNumber("1,234.50"), { value: 1234.5, invalid: false, raw: "1,234.50" });
  assert.equal(parseNullableNumber("₹ 42").value, 42);
  assert.deepEqual(parseNullableNumber("12 lakh"), { value: null, invalid: true, raw: "12 lakh" });
  assert.deepEqual(parseNullableNumber(""), { value: null, invalid: false, raw: null });
});

test("strictly validates ISO calendar dates", () => {
  assert.equal(parseIsoDate("2026-02-28").value, "2026-02-28");
  assert.equal(parseIsoDate("2026-02-30").invalid, true);
  assert.equal(parseIsoDate("28/02/2026").invalid, true);
  assert.equal(parseIsoDate(null).value, null);
});

test("normalizes a deal and keeps missing values null with quality issues", () => {
  const normalized = normalizeDealItem(
    item("d1", "Deal", {
      [DEAL_COLUMN_IDS.clientCode]: "COMPANY_002",
      [DEAL_COLUMN_IDS.status]: "Open",
      [DEAL_COLUMN_IDS.value]: "bad-number",
      [DEAL_COLUMN_IDS.tentativeCloseDate]: "2026-09-30",
      [DEAL_COLUMN_IDS.sourceRow]: "4",
    }),
  );

  assert.equal(normalized.record.normalizedClientKey, "COMPANY002");
  assert.equal(normalized.record.value, null);
  assert.equal(normalized.record.malformed, false);
  assert.ok(normalized.issues.some((issue) => issue.code === "invalid_numeric_value"));
  assert.ok(normalized.issues.some((issue) => issue.code === "missing_monetary_value"));
});

test("normalizes Work Order customer codes into the Deals namespace", () => {
  const normalized = normalizeWorkOrderItem(
    item("w1", "SDPLDEAL-002", {
      [WORK_ORDER_COLUMN_IDS.customerCode]: "WOCOMPANY_002",
      [WORK_ORDER_COLUMN_IDS.serialNumber]: "SDPLDEAL-002",
      [WORK_ORDER_COLUMN_IDS.executionStatus]: "Ongoing",
      [WORK_ORDER_COLUMN_IDS.amountInclGst]: "3521234.8848",
      [WORK_ORDER_COLUMN_IDS.amountReceivable]: "28272.42533112",
      [WORK_ORDER_COLUMN_IDS.probableStartDate]: "2025-05-01",
      [WORK_ORDER_COLUMN_IDS.probableEndDate]: "2026-04-30",
    }),
  );

  assert.equal(normalized.record.normalizedClientKey, "COMPANY002");
  assert.equal(normalized.record.serialNumber, "SDPLDEAL-002");
  assert.equal(normalized.record.amountInclGst, 3521234.8848);
});

test("header-like rows are explicitly marked malformed", () => {
  const normalized = normalizeDealItem(item("header", "Deal Name", {}));
  assert.equal(normalized.record.malformed, true);
  assert.ok(normalized.issues.some((issue) => issue.code === "malformed_row"));
});
