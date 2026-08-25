import type { Deal, WorkOrder } from "../../types";

export function normalizeLabel(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function roundAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function sumKnown(values: Array<number | null>): number {
  return roundAmount(values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

export function isOpenDeal(deal: Deal): boolean {
  return normalizeLabel(deal.status) === "open";
}

export function isWonDeal(deal: Deal): boolean {
  return normalizeLabel(deal.status) === "won";
}

export function isDeadDeal(deal: Deal): boolean {
  const status = normalizeLabel(deal.status);
  const stage = normalizeLabel(deal.stage);
  return status === "dead" || stage.includes("project lost") || stage.includes("not relevant");
}

export function isActiveDeal(deal: Deal): boolean {
  const status = normalizeLabel(deal.status);
  return ["open", "on hold", "working on it", "stuck"].includes(status);
}

export type WorkOrderStatusBucket = "completed" | "ongoing" | "not_started" | "paused" | "active_other" | "unknown";

export function classifyWorkOrderStatus(workOrder: WorkOrder): WorkOrderStatusBucket {
  const status = normalizeLabel(workOrder.executionStatus);
  if (["completed", "done"].includes(status)) return "completed";
  if (["ongoing", "executed until current month", "partial completed"].includes(status)) return "ongoing";
  if (status === "not started") return "not_started";
  if (["pause / struck", "stuck"].includes(status)) return "paused";
  if (["working on it", "details pending from client"].includes(status)) return "active_other";
  return "unknown";
}

export function isActiveWorkOrder(workOrder: WorkOrder): boolean {
  return ["ongoing", "not_started", "paused", "active_other"].includes(classifyWorkOrderStatus(workOrder));
}

function toUtcTimestamp(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

export function isDelayedWorkOrder(workOrder: WorkOrder, asOfDate: string): boolean {
  if (workOrder.malformed || !isActiveWorkOrder(workOrder)) return false;
  const asOf = toUtcTimestamp(asOfDate);
  const bucket = classifyWorkOrderStatus(workOrder);

  if (bucket === "not_started" && workOrder.probableStartDate) {
    return toUtcTimestamp(workOrder.probableStartDate) < asOf;
  }
  if (workOrder.probableEndDate) {
    return toUtcTimestamp(workOrder.probableEndDate) < asOf;
  }
  return false;
}

export function incrementDistribution(distribution: Record<string, number>, label: string | null): void {
  const key = label?.trim() || "Unknown";
  distribution[key] = (distribution[key] ?? 0) + 1;
}
