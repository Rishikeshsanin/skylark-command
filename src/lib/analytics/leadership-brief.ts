import type {
  DataQualityIssue,
  Deal,
  LeadershipBriefData,
  PresentationMetadata,
  WorkOrder,
} from "../../types";
import { buildClientIntelligence, calculateSectorMetrics } from "./cross-board";
import { buildDataQualityReport } from "./data-quality";
import { calculatePipelineMetrics, findRiskyDeals, largestDeals } from "./deals";
import { calculateWorkOrderHealth } from "./work-orders";

export function buildLeadershipBriefData(
  deals: Deal[],
  workOrders: WorkOrder[],
  asOfDate: string,
  normalizationIssues: DataQualityIssue[] = [],
): LeadershipBriefData & PresentationMetadata {
  const dataQuality = buildDataQualityReport(deals, workOrders, normalizationIssues, asOfDate);
  const dealRecordsAnalyzed = deals.filter((deal) => !deal.malformed).length;
  const workOrderRecordsAnalyzed = workOrders.filter((workOrder) => !workOrder.malformed).length;
  return {
    pipeline: calculatePipelineMetrics(deals),
    workOrders: calculateWorkOrderHealth(workOrders, asOfDate),
    topOpenDeals: largestDeals(deals, 5, true),
    riskyDeals: findRiskyDeals(deals, asOfDate).slice(0, 5),
    clientsWithCommercialAndOperationalExposure: buildClientIntelligence(deals, workOrders, asOfDate)
      .filter((client) => client.hasCombinedCommercialOperationalRisk)
      .slice(0, 10),
    sectorMetrics: calculateSectorMetrics(deals, workOrders),
    dataQuality,
    currencyCode: "INR",
    provenance: {
      dealRecordsAnalyzed,
      workOrderRecordsAnalyzed,
      totalRecordsAnalyzed: dealRecordsAnalyzed + workOrderRecordsAnalyzed,
    },
  };
}
