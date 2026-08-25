import type { DataQualityIssue, DataQualityReport, Deal, WorkOrder } from "../../types";

function compareIsoDate(left: string, right: string): number {
  return left.localeCompare(right);
}

function inconsistentLabelIssues(
  entityType: "deal" | "work_order",
  field: string,
  values: Array<string | null>,
): DataQualityIssue[] {
  const groups = new Map<string, Set<string>>();
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)?.add(trimmed);
  }

  const issues: DataQualityIssue[] = [];
  for (const variants of groups.values()) {
    if (variants.size > 1) {
      issues.push({
        code: "inconsistent_label",
        severity: "info",
        entityType,
        field,
        message: `Inconsistent ${field} labels: ${[...variants].sort().join(", ")}`,
      });
    }
  }
  return issues;
}

export function buildDataQualityReport(
  deals: Deal[],
  workOrders: WorkOrder[],
  normalizationIssues: DataQualityIssue[] = [],
  asOfDate?: string,
): DataQualityReport {
  const issues = [...normalizationIssues];
  const dealKeys = new Set(deals.map((deal) => deal.normalizedClientKey).filter((value): value is string => Boolean(value)));
  const unmappedWorkOrderIds = new Set<string>();

  for (const workOrder of workOrders) {
    if (workOrder.normalizedClientKey && !dealKeys.has(workOrder.normalizedClientKey)) {
      unmappedWorkOrderIds.add(workOrder.mondayItemId);
      issues.push({
        code: "unmapped_client",
        severity: "warning",
        entityType: "work_order",
        entityId: workOrder.mondayItemId,
        field: "normalizedClientKey",
        message: `No Deals client matched Work Order client key ${workOrder.normalizedClientKey}.`,
      });
    }

    if (workOrder.probableStartDate && workOrder.probableEndDate && compareIsoDate(workOrder.probableEndDate, workOrder.probableStartDate) < 0) {
      issues.push({
        code: "invalid_schedule_range",
        severity: "warning",
        entityType: "work_order",
        entityId: workOrder.mondayItemId,
        field: "probableEndDate",
        message: "Probable end date is before probable start date.",
      });
    }
  }

  const serials = new Map<string, string[]>();
  for (const workOrder of workOrders) {
    if (!workOrder.serialNumber) continue;
    serials.set(workOrder.serialNumber, [...(serials.get(workOrder.serialNumber) ?? []), workOrder.mondayItemId]);
  }
  for (const [serial, ids] of serials) {
    if (ids.length > 1) {
      issues.push({
        code: "duplicate_serial_number",
        severity: "error",
        entityType: "dataset",
        field: "serialNumber",
        message: `Work Order serial number ${serial} appears ${ids.length} times.`,
      });
    }
  }

  if (asOfDate) {
    for (const deal of deals) {
      if (deal.createdDate && compareIsoDate(deal.createdDate, asOfDate) > 0) {
        issues.push({
          code: "future_created_date",
          severity: "warning",
          entityType: "deal",
          entityId: deal.mondayItemId,
          field: "createdDate",
          message: "Deal created date is in the future relative to the analysis date.",
        });
      }
      if (deal.status?.trim().toLowerCase() === "open" && deal.tentativeCloseDate && compareIsoDate(deal.tentativeCloseDate, asOfDate) < 0) {
        issues.push({
          code: "stale_close_date",
          severity: "info",
          entityType: "deal",
          entityId: deal.mondayItemId,
          field: "tentativeCloseDate",
          message: "Open deal has a tentative close date in the past.",
        });
      }
    }
  }

  issues.push(...inconsistentLabelIssues("deal", "status", deals.map((deal) => deal.status)));
  issues.push(...inconsistentLabelIssues("deal", "stage", deals.map((deal) => deal.stage)));
  issues.push(...inconsistentLabelIssues("deal", "sector", deals.map((deal) => deal.sector)));
  issues.push(...inconsistentLabelIssues("work_order", "executionStatus", workOrders.map((workOrder) => workOrder.executionStatus)));
  issues.push(...inconsistentLabelIssues("work_order", "sector", workOrders.map((workOrder) => workOrder.sector)));
  issues.push(...inconsistentLabelIssues("work_order", "billingStatus", workOrders.map((workOrder) => workOrder.billingStatus)));

  const issueCounts = issues.reduce(
    (counts, item) => {
      counts[item.severity] += 1;
      return counts;
    },
    { info: 0, warning: 0, error: 0 },
  );

  return {
    totalDeals: deals.length,
    totalWorkOrders: workOrders.length,
    malformedDeals: deals.filter((deal) => deal.malformed).length,
    malformedWorkOrders: workOrders.filter((workOrder) => workOrder.malformed).length,
    unmappedWorkOrderClients: unmappedWorkOrderIds.size,
    issueCounts,
    issues,
  };
}
