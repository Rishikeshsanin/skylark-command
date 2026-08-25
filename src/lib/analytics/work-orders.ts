import type { WorkOrder, WorkOrderHealth } from "../../types";
import {
  classifyWorkOrderStatus,
  incrementDistribution,
  isActiveWorkOrder,
  isDelayedWorkOrder,
  normalizeLabel,
  sumKnown,
} from "./helpers";

function usableWorkOrders(workOrders: WorkOrder[]): WorkOrder[] {
  return workOrders.filter((workOrder) => !workOrder.malformed);
}

export function calculateWorkOrderHealth(workOrders: WorkOrder[], asOfDate: string): WorkOrderHealth {
  const valid = usableWorkOrders(workOrders);
  const executionStatusDistribution: Record<string, number> = {};
  const invoiceStatusDistribution: Record<string, number> = {};
  const billingStatusDistribution: Record<string, number> = {};

  for (const workOrder of valid) {
    incrementDistribution(executionStatusDistribution, workOrder.executionStatus);
    incrementDistribution(invoiceStatusDistribution, workOrder.invoiceStatus);
    incrementDistribution(billingStatusDistribution, workOrder.billingStatus);
  }

  return {
    totalWorkOrders: valid.length,
    activeWorkOrders: valid.filter(isActiveWorkOrder).length,
    completedWorkOrders: valid.filter((workOrder) => classifyWorkOrderStatus(workOrder) === "completed").length,
    ongoingWorkOrders: valid.filter((workOrder) => classifyWorkOrderStatus(workOrder) === "ongoing").length,
    notStartedWorkOrders: valid.filter((workOrder) => classifyWorkOrderStatus(workOrder) === "not_started").length,
    pausedWorkOrders: valid.filter((workOrder) => classifyWorkOrderStatus(workOrder) === "paused").length,
    delayedWorkOrders: valid.filter((workOrder) => isDelayedWorkOrder(workOrder, asOfDate)).length,
    arPriorityWorkOrders: valid.filter((workOrder) => normalizeLabel(workOrder.arPriority) === "priority").length,
    totalAmountInclGst: sumKnown(valid.map((workOrder) => workOrder.amountInclGst)),
    billedValueInclGst: sumKnown(valid.map((workOrder) => workOrder.billedValueInclGst)),
    amountToBeBilledInclGst: sumKnown(valid.map((workOrder) => workOrder.amountToBeBilledInclGst)),
    collectedAmountInclGst: sumKnown(valid.map((workOrder) => workOrder.collectedAmountInclGst)),
    receivables: sumKnown(valid.map((workOrder) => workOrder.amountReceivable)),
    unknownAmountCount: valid.filter((workOrder) => workOrder.amountInclGst === null).length,
    unknownReceivableCount: valid.filter((workOrder) => workOrder.amountReceivable === null).length,
    executionStatusDistribution,
    invoiceStatusDistribution,
    billingStatusDistribution,
  };
}
