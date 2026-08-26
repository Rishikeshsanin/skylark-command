import type { BusinessDataSnapshot } from "@/lib/business-data";
import type { Deal, WorkOrder } from "@/types";
import type { ScenarioOverride } from "./contracts";

export interface AppliedScenario {
  snapshot: BusinessDataSnapshot;
  caveats: string[];
  touchedDealIds: string[];
  touchedWorkOrderIds: string[];
}

function quarterAnchor(quarter: string): string {
  const match = /^Q([1-4]) (20\d{2})$/.exec(quarter);
  if (!match) throw new Error("Scenario quarter must use canonical format such as Q3 2026.");
  const month = (Number(match[1]) - 1) * 3 + 1;
  return `${match[2]}-${String(month).padStart(2, "0")}-01`;
}

function cloneDeal(deal: Deal): Deal {
  return { ...deal, sourceQualityFlags: [...deal.sourceQualityFlags] };
}

function cloneWorkOrder(workOrder: WorkOrder): WorkOrder {
  return { ...workOrder, sourceQualityFlags: [...workOrder.sourceQualityFlags] };
}

function cloneSnapshot(snapshot: BusinessDataSnapshot): BusinessDataSnapshot {
  return {
    deals: snapshot.deals.map(cloneDeal),
    workOrders: snapshot.workOrders.map(cloneWorkOrder),
    normalizationIssues: snapshot.normalizationIssues.map((issue) => ({ ...issue })),
    source: { ...snapshot.source },
  };
}

function findDeal(snapshot: BusinessDataSnapshot, id: string): Deal {
  const deal = snapshot.deals.find((candidate) => candidate.mondayItemId === id);
  if (!deal) throw new Error(`Scenario references unknown Deal ${id}.`);
  return deal;
}

function findWorkOrder(snapshot: BusinessDataSnapshot, id: string): WorkOrder {
  const workOrder = snapshot.workOrders.find((candidate) => candidate.mondayItemId === id);
  if (!workOrder) throw new Error(`Scenario references unknown Work Order ${id}.`);
  return workOrder;
}

export function applyScenarioOverrides(
  baseline: BusinessDataSnapshot,
  overrides: ScenarioOverride[],
): AppliedScenario {
  const snapshot = cloneSnapshot(baseline);
  const touchedDealIds = new Set<string>();
  const touchedWorkOrderIds = new Set<string>();
  const caveats = [
    "Scenario data is an in-memory hypothetical clone. No monday.com source record is changed or written.",
  ];

  const inclusion = new Map<string, boolean>();
  for (const override of overrides) {
    if (override.type === "set_deal_included") {
      findDeal(snapshot, override.dealId);
      inclusion.set(override.dealId, override.included);
      touchedDealIds.add(override.dealId);
    }
  }

  if (inclusion.size > 0) {
    snapshot.deals = snapshot.deals.filter(
      (deal) => inclusion.get(deal.mondayItemId) !== false,
    );
  }

  for (const override of overrides) {
    switch (override.type) {
      case "set_deal_included":
        break;

      case "move_deal_close_period": {
        const deal = findDeal(snapshot, override.dealId);
        deal.closeDate = null;
        deal.tentativeCloseDate = quarterAnchor(override.quarter);
        touchedDealIds.add(override.dealId);
        caveats.push(
          `Deal ${override.dealId} was placed at the first day of ${override.quarter} as a deterministic scenario-period anchor; that anchor is not a forecasted close date.`,
        );
        break;
      }

      case "move_deal_close_date": {
        const deal = findDeal(snapshot, override.dealId);
        deal.closeDate = null;
        deal.tentativeCloseDate = override.date;
        touchedDealIds.add(override.dealId);
        break;
      }

      case "set_deal_outcome": {
        const deal = findDeal(snapshot, override.dealId);
        deal.status = override.outcome === "won" ? "Won" : override.outcome === "lost" ? "Dead" : "Open";
        touchedDealIds.add(override.dealId);
        break;
      }

      case "set_collection_amount": {
        const workOrder = findWorkOrder(snapshot, override.workOrderId);
        workOrder.collectedAmountInclGst = override.amount;
        touchedWorkOrderIds.add(override.workOrderId);
        caveats.push(
          `Collection amount override for Work Order ${override.workOrderId} changes collected amount only; receivables are unchanged unless an explicit receivable-payment override is also supplied.`,
        );
        break;
      }

      case "apply_receivable_payment": {
        const workOrder = findWorkOrder(snapshot, override.workOrderId);
        if (workOrder.amountReceivable === null) {
          throw new Error(`Work Order ${override.workOrderId} has unknown receivables; a payment scenario cannot invent the baseline amount.`);
        }
        if (override.amount > workOrder.amountReceivable) {
          throw new Error(`Payment for Work Order ${override.workOrderId} exceeds its known baseline receivable.`);
        }
        workOrder.amountReceivable = Math.max(0, workOrder.amountReceivable - override.amount);
        if (workOrder.collectedAmountInclGst !== null) {
          workOrder.collectedAmountInclGst += override.amount;
        } else {
          caveats.push(
            `Collected amount for Work Order ${override.workOrderId} is unknown, so the scenario updates the known receivable but does not fabricate a collected-total baseline.`,
          );
        }
        touchedWorkOrderIds.add(override.workOrderId);
        break;
      }

      case "delay_work_order": {
        const workOrder = findWorkOrder(snapshot, override.workOrderId);
        workOrder.probableEndDate = override.newProbableEndDate;
        touchedWorkOrderIds.add(override.workOrderId);
        break;
      }

      case "resolve_work_order": {
        const workOrder = findWorkOrder(snapshot, override.workOrderId);
        workOrder.executionStatus = "Completed";
        touchedWorkOrderIds.add(override.workOrderId);
        break;
      }
    }
  }

  return {
    snapshot,
    caveats: [...new Set(caveats)],
    touchedDealIds: [...touchedDealIds].sort(),
    touchedWorkOrderIds: [...touchedWorkOrderIds].sort(),
  };
}
