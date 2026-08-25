import {
  buildDataQualityReport,
  buildLeadershipBriefData,
  calculatePipelineMetrics,
  calculateSectorMetrics,
  calculateWorkOrderHealth,
  clientsWithOpenDealsAndActiveWorkOrders,
  dealCloseQuarterMetrics,
  findRiskyDeals,
  pipelineByStage,
} from "@/lib/analytics";
import {
  loadBusinessData,
  type BusinessDataSnapshot,
} from "@/lib/business-data";
import { PublicApiError } from "@/lib/server/errors";
import type { AgentResponse, AnalyticsResult } from "@/types";
import type { QueryPlan } from "./schemas";

export interface AnalyticsExecution {
  result: AnalyticsResult<unknown>;
  source: AgentResponse["source"];
}

export type AnalyticsDispatcher = (plan: QueryPlan) => Promise<AnalyticsExecution>;

function analysisDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentQuarterLabel(now = new Date()): string {
  const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${now.getUTCFullYear()}`;
}

function snapshotSource(
  snapshot: BusinessDataSnapshot,
): AgentResponse["source"] {
  return {
    provider: "monday.com",
    boardIds: [
      snapshot.source.dealsBoardId,
      snapshot.source.workOrdersBoardId,
    ],
    fetchedAt: snapshot.source.fetchedAt,
  };
}

function ensureSupportedPeriodScope(plan: QueryPlan): void {
  const isTimeScoped = Boolean(plan.period || plan.quarter);
  if (!isTimeScoped || plan.intent === "quarter_analysis") return;

  throw new PublicApiError(
    422,
    "PERIOD_SCOPE_NOT_WIRED",
    "That time-scoped analysis is not yet exposed by deterministic analytics.",
  );
}

function quarterResult(
  snapshot: BusinessDataSnapshot,
  plan: QueryPlan,
): AnalyticsResult<unknown> {
  const all = dealCloseQuarterMetrics(snapshot.deals, false);
  let selected = all;
  let requestedLabel: string | undefined;

  if (plan.quarter) {
    requestedLabel = plan.quarter;
    selected = all.filter((metric) => metric.quarter === plan.quarter);
  } else if (plan.period === "current_quarter") {
    requestedLabel = currentQuarterLabel();
    selected = all.filter((metric) => metric.quarter === requestedLabel);
  } else if (plan.period === "current_year") {
    const year = String(new Date().getUTCFullYear());
    selected = all.filter((metric) => metric.quarter.endsWith(` ${year}`));
  } else if (plan.period === "latest_available") {
    selected = all.length > 0 ? [all[all.length - 1]] : [];
  }

  const caveats: string[] = [];
  if (selected.length === 0 && requestedLabel) {
    const latest = all.at(-1)?.quarter;
    caveats.push(
      latest
        ? `No deal close data matched ${requestedLabel}. Latest available quarter is ${latest}.`
        : `No deal close data matched ${requestedLabel}, and no dated deal quarters are available.`,
    );
  }

  return { data: selected, caveats };
}

export function executePlanAgainstSnapshot(
  plan: QueryPlan,
  snapshot: BusinessDataSnapshot,
): AnalyticsResult<unknown> {
  ensureSupportedPeriodScope(plan);
  const asOfDate = analysisDate();
  const dataQuality = buildDataQualityReport(
    snapshot.deals,
    snapshot.workOrders,
    snapshot.normalizationIssues,
    asOfDate,
  );

  let result: AnalyticsResult<unknown>;

  switch (plan.intent) {
    case "pipeline_overview":
    case "won_value":
      result = { data: calculatePipelineMetrics(snapshot.deals), caveats: [] };
      break;

    case "pipeline_by_sector": {
      const metrics = calculateSectorMetrics(
        snapshot.deals,
        snapshot.workOrders,
      );
      const selected = plan.sector
        ? metrics.filter(
            (metric) =>
              metric.sector.toLowerCase() === plan.sector?.toLowerCase(),
          )
        : metrics;
      result = {
        data: selected,
        caveats:
          plan.sector && selected.length === 0
            ? [`No normalized records matched sector “${plan.sector}”.`]
            : [],
      };
      break;
    }

    case "pipeline_by_stage":
      result = { data: pipelineByStage(snapshot.deals, true), caveats: [] };
      break;

    case "deal_prioritization":
      result = {
        data: findRiskyDeals(snapshot.deals, asOfDate),
        caveats: [],
      };
      break;

    case "quarter_analysis":
      result = quarterResult(snapshot, plan);
      break;

    case "work_order_health":
    case "receivables":
      result = {
        data: calculateWorkOrderHealth(snapshot.workOrders, asOfDate),
        caveats: [],
      };
      break;

    case "client_cross_board":
      if (
        plan.focus === "customer_won_value" ||
        plan.focus === "customer_pipeline" ||
        plan.focus === "customer_execution" ||
        plan.focus === "customer_combined"
      ) {
        throw new PublicApiError(
          422,
          "CUSTOMER_RANKING_NOT_WIRED",
          "That customer ranking definition is not yet exposed by deterministic analytics.",
        );
      }
      result = {
        data: clientsWithOpenDealsAndActiveWorkOrders(
          snapshot.deals,
          snapshot.workOrders,
          asOfDate,
        ),
        caveats: [],
      };
      break;

    case "data_health":
      result = { data: dataQuality, caveats: [] };
      break;

    case "leadership_brief":
    case "general_overview":
      result = {
        data: buildLeadershipBriefData(
          snapshot.deals,
          snapshot.workOrders,
          asOfDate,
          snapshot.normalizationIssues,
        ),
        caveats: [],
      };
      break;

    case "unknown":
      throw new PublicApiError(
        400,
        "UNKNOWN_INTENT",
        "The business question could not be mapped to a supported analytics intent.",
      );
  }

  return {
    ...result,
    dataQuality,
  };
}

/**
 * Thin orchestration seam over Agent 1's live loader and pure analytics exports.
 * No business arithmetic is implemented here.
 */
export const dispatchDeterministicAnalytics: AnalyticsDispatcher = async (
  plan,
) => {
  const snapshot = await loadBusinessData();
  return {
    result: executePlanAgainstSnapshot(plan, snapshot),
    source: snapshotSource(snapshot),
  };
};
