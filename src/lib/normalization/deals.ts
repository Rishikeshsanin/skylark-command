import type { DataQualityIssue, Deal } from "../../types";
import { DEAL_COLUMN_IDS } from "../monday/columns";
import type { MondayItem } from "../monday/types";
import { normalizeClientCode } from "./client-code";
import {
  columnText,
  isHeaderLikeName,
  normalizeText,
  parseIsoDate,
  parseNullableNumber,
  splitQualityFlags,
} from "./parsers";
import type { NormalizationResult, NormalizedRecordResult } from "./types";

function issue(
  item: MondayItem,
  code: string,
  field: string,
  message: string,
  rawValue?: string | null,
  severity: DataQualityIssue["severity"] = "warning",
): DataQualityIssue {
  return {
    code,
    severity,
    entityType: "deal",
    entityId: item.id,
    field,
    message,
    ...(rawValue ? { rawValue } : {}),
  };
}

function parseNumberField(
  item: MondayItem,
  columnId: string,
  field: string,
  issues: DataQualityIssue[],
): number | null {
  const parsed = parseNullableNumber(columnText(item, columnId));
  if (parsed.invalid) {
    issues.push(issue(item, "invalid_numeric_value", field, `Invalid numeric value in ${field}.`, parsed.raw));
  }
  return parsed.value;
}

function parseDateField(
  item: MondayItem,
  columnId: string,
  field: string,
  issues: DataQualityIssue[],
): string | null {
  const parsed = parseIsoDate(columnText(item, columnId));
  if (parsed.invalid) {
    issues.push(issue(item, "invalid_date", field, `Invalid date in ${field}.`, parsed.raw));
  }
  return parsed.value;
}

export function normalizeDealItem(item: MondayItem): NormalizedRecordResult<Deal> {
  const issues: DataQualityIssue[] = [];
  const clientCode = columnText(item, DEAL_COLUMN_IDS.clientCode);
  const computedClientKey = normalizeClientCode(clientCode);
  const storedClientKey = normalizeClientCode(columnText(item, DEAL_COLUMN_IDS.normalizedClientKey));
  const value = parseNumberField(item, DEAL_COLUMN_IDS.value, "value", issues);
  const closeDate = parseDateField(item, DEAL_COLUMN_IDS.closeDate, "closeDate", issues);
  const tentativeCloseDate = parseDateField(item, DEAL_COLUMN_IDS.tentativeCloseDate, "tentativeCloseDate", issues);
  const createdDate = parseDateField(item, DEAL_COLUMN_IDS.createdDate, "createdDate", issues);
  const sourceRow = parseNumberField(item, DEAL_COLUMN_IDS.sourceRow, "sourceRow", issues);
  const status = columnText(item, DEAL_COLUMN_IDS.status);
  const stage = columnText(item, DEAL_COLUMN_IDS.stage);
  const sector = columnText(item, DEAL_COLUMN_IDS.sector);
  const sourceQualityFlags = splitQualityFlags(columnText(item, DEAL_COLUMN_IDS.dataQualityFlags));

  if (!clientCode) {
    issues.push(issue(item, "missing_client_code", "clientCode", "Deal is missing a client code."));
  }
  if (value === null) {
    issues.push(issue(item, "missing_monetary_value", "value", "Deal value is missing or unusable."));
  }
  if (!closeDate && !tentativeCloseDate) {
    issues.push(issue(item, "missing_close_date", "closeDate", "Deal has neither an actual nor tentative close date.", null, "info"));
  }
  if (computedClientKey && storedClientKey && computedClientKey !== storedClientKey) {
    issues.push(issue(item, "client_key_mismatch", "normalizedClientKey", "Stored and computed client keys do not match."));
  }

  for (const flag of sourceQualityFlags) {
    issues.push(issue(item, "source_quality_flag", "sourceQualityFlags", flag, flag, "info"));
  }

  const businessSignals = [clientCode, status, stage, sector, value, closeDate, tentativeCloseDate].filter(
    (value_) => value_ !== null,
  ).length;
  const malformed = isHeaderLikeName(item.name) || businessSignals === 0;
  if (malformed) {
    issues.push(issue(item, "malformed_row", "name", "Deal row appears malformed or header-like.", item.name, "error"));
  }

  return {
    record: {
      mondayItemId: item.id,
      name: normalizeText(item.name) ?? `Deal ${item.id}`,
      ownerCode: columnText(item, DEAL_COLUMN_IDS.ownerCode),
      clientCode,
      normalizedClientKey: computedClientKey ?? storedClientKey,
      status,
      closeDate,
      closureProbability: columnText(item, DEAL_COLUMN_IDS.closureProbability),
      value,
      tentativeCloseDate,
      stage,
      productDeal: columnText(item, DEAL_COLUMN_IDS.productDeal),
      sector,
      createdDate,
      sourceRow,
      sourceQualityFlags,
      malformed,
    },
    issues,
  };
}

export function normalizeDeals(items: MondayItem[]): NormalizationResult<Deal> {
  const records: Deal[] = [];
  const issues: DataQualityIssue[] = [];
  for (const item of items) {
    const normalized = normalizeDealItem(item);
    records.push(normalized.record);
    issues.push(...normalized.issues);
  }
  return { records, issues };
}
