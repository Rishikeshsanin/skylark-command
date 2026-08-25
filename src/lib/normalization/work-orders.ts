import type { DataQualityIssue, WorkOrder } from "../../types";
import { WORK_ORDER_COLUMN_IDS } from "../monday/columns";
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
    entityType: "work_order",
    entityId: item.id,
    field,
    message,
    ...(rawValue ? { rawValue } : {}),
  };
}

function numberField(
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

function dateField(
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

export function normalizeWorkOrderItem(item: MondayItem): NormalizedRecordResult<WorkOrder> {
  const issues: DataQualityIssue[] = [];
  const customerCode = columnText(item, WORK_ORDER_COLUMN_IDS.customerCode);
  const computedClientKey = normalizeClientCode(customerCode);
  const storedClientKey = normalizeClientCode(columnText(item, WORK_ORDER_COLUMN_IDS.normalizedClientKey));
  const serialNumber = columnText(item, WORK_ORDER_COLUMN_IDS.serialNumber);
  const executionStatus = columnText(item, WORK_ORDER_COLUMN_IDS.executionStatus);
  const sector = columnText(item, WORK_ORDER_COLUMN_IDS.sector);
  const amountInclGst = numberField(item, WORK_ORDER_COLUMN_IDS.amountInclGst, "amountInclGst", issues);
  const amountReceivable = numberField(item, WORK_ORDER_COLUMN_IDS.amountReceivable, "amountReceivable", issues);
  const probableStartDate = dateField(item, WORK_ORDER_COLUMN_IDS.probableStartDate, "probableStartDate", issues);
  const probableEndDate = dateField(item, WORK_ORDER_COLUMN_IDS.probableEndDate, "probableEndDate", issues);
  const sourceQualityFlags = splitQualityFlags(columnText(item, WORK_ORDER_COLUMN_IDS.dataQualityFlags));

  if (!serialNumber) {
    issues.push(issue(item, "missing_serial_number", "serialNumber", "Work Order is missing its source serial number.", null, "error"));
  }
  if (!customerCode) {
    issues.push(issue(item, "missing_client_code", "customerCode", "Work Order is missing a customer code."));
  }
  if (amountInclGst === null) {
    issues.push(issue(item, "missing_monetary_value", "amountInclGst", "Work Order total amount including GST is missing or unusable.", null, "info"));
  }
  if (amountReceivable === null) {
    issues.push(issue(item, "missing_receivable_value", "amountReceivable", "Work Order receivable value is missing or unusable.", null, "info"));
  }
  if (!probableStartDate && !probableEndDate) {
    issues.push(issue(item, "missing_schedule_dates", "probableStartDate", "Work Order has no probable start/end schedule dates.", null, "info"));
  }
  if (computedClientKey && storedClientKey && computedClientKey !== storedClientKey) {
    issues.push(issue(item, "client_key_mismatch", "normalizedClientKey", "Stored and computed client keys do not match."));
  }

  for (const flag of sourceQualityFlags) {
    issues.push(issue(item, "source_quality_flag", "sourceQualityFlags", flag, flag, "info"));
  }

  const sourceRow = numberField(item, WORK_ORDER_COLUMN_IDS.sourceRow, "sourceRow", issues);
  const businessSignals = [customerCode, serialNumber, executionStatus, sector, amountInclGst, probableStartDate, probableEndDate].filter(
    (value) => value !== null,
  ).length;
  const malformed = isHeaderLikeName(item.name) || businessSignals === 0;
  if (malformed) {
    issues.push(issue(item, "malformed_row", "name", "Work Order row appears malformed or header-like.", item.name, "error"));
  }

  return {
    record: {
      mondayItemId: item.id,
      name: normalizeText(item.name) ?? `Work Order ${item.id}`,
      customerCode,
      normalizedClientKey: computedClientKey ?? storedClientKey,
      serialNumber,
      natureOfWork: columnText(item, WORK_ORDER_COLUMN_IDS.natureOfWork),
      lastExecutedMonth: columnText(item, WORK_ORDER_COLUMN_IDS.lastExecutedMonth),
      executionStatus,
      dataDeliveryDate: dateField(item, WORK_ORDER_COLUMN_IDS.dataDeliveryDate, "dataDeliveryDate", issues),
      poDate: dateField(item, WORK_ORDER_COLUMN_IDS.poDate, "poDate", issues),
      documentType: columnText(item, WORK_ORDER_COLUMN_IDS.documentType),
      probableStartDate,
      probableEndDate,
      bdKamPersonnelCode: columnText(item, WORK_ORDER_COLUMN_IDS.bdKamPersonnelCode),
      sector,
      typeOfWork: columnText(item, WORK_ORDER_COLUMN_IDS.typeOfWork),
      softwarePlatform: columnText(item, WORK_ORDER_COLUMN_IDS.softwarePlatform),
      lastInvoiceDate: dateField(item, WORK_ORDER_COLUMN_IDS.lastInvoiceDate, "lastInvoiceDate", issues),
      latestInvoiceNumber: columnText(item, WORK_ORDER_COLUMN_IDS.latestInvoiceNumber),
      amountExclGst: numberField(item, WORK_ORDER_COLUMN_IDS.amountExclGst, "amountExclGst", issues),
      amountInclGst,
      billedValueExclGst: numberField(item, WORK_ORDER_COLUMN_IDS.billedValueExclGst, "billedValueExclGst", issues),
      billedValueInclGst: numberField(item, WORK_ORDER_COLUMN_IDS.billedValueInclGst, "billedValueInclGst", issues),
      collectedAmountInclGst: numberField(item, WORK_ORDER_COLUMN_IDS.collectedAmountInclGst, "collectedAmountInclGst", issues),
      amountToBeBilledExclGst: numberField(item, WORK_ORDER_COLUMN_IDS.amountToBeBilledExclGst, "amountToBeBilledExclGst", issues),
      amountToBeBilledInclGst: numberField(item, WORK_ORDER_COLUMN_IDS.amountToBeBilledInclGst, "amountToBeBilledInclGst", issues),
      amountReceivable,
      arPriority: columnText(item, WORK_ORDER_COLUMN_IDS.arPriority),
      quantityByOps: numberField(item, WORK_ORDER_COLUMN_IDS.quantityByOps, "quantityByOps", issues),
      quantitiesAsPerPo: columnText(item, WORK_ORDER_COLUMN_IDS.quantitiesAsPerPo),
      quantityBilledTillDate: numberField(item, WORK_ORDER_COLUMN_IDS.quantityBilledTillDate, "quantityBilledTillDate", issues),
      balanceQuantity: numberField(item, WORK_ORDER_COLUMN_IDS.balanceQuantity, "balanceQuantity", issues),
      invoiceStatus: columnText(item, WORK_ORDER_COLUMN_IDS.invoiceStatus),
      expectedBillingMonth: columnText(item, WORK_ORDER_COLUMN_IDS.expectedBillingMonth),
      actualBillingMonth: columnText(item, WORK_ORDER_COLUMN_IDS.actualBillingMonth),
      actualCollectionMonth: columnText(item, WORK_ORDER_COLUMN_IDS.actualCollectionMonth),
      woStatusBilled: columnText(item, WORK_ORDER_COLUMN_IDS.woStatusBilled),
      collectionStatus: columnText(item, WORK_ORDER_COLUMN_IDS.collectionStatus),
      collectionDate: columnText(item, WORK_ORDER_COLUMN_IDS.collectionDate),
      billingStatus: columnText(item, WORK_ORDER_COLUMN_IDS.billingStatus),
      sourceRow,
      sourceQualityFlags,
      malformed,
    },
    issues,
  };
}

export function normalizeWorkOrders(items: MondayItem[]): NormalizationResult<WorkOrder> {
  const records: WorkOrder[] = [];
  const issues: DataQualityIssue[] = [];
  for (const item of items) {
    const normalized = normalizeWorkOrderItem(item);
    records.push(normalized.record);
    issues.push(...normalized.issues);
  }
  return { records, issues };
}
