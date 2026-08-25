import {
  buildDataQualityReport,
  buildLeadershipBriefData,
  calculatePipelineMetrics,
  calculateSectorMetrics,
  calculateWorkOrderHealth,
  clientsWithOpenDealsAndActiveWorkOrders,
  dealCloseQuarterMetrics,
  findRiskyDeals,
  getFounderAttentionFeed,
  getLatestAvailableQuarter,
  getPipelineForCurrentQuarter,
  getPipelineForQuarter,
  getSectorPerformanceForCurrentQuarter,
  getSectorPerformanceForQuarter,
  pipelineByStage,
  rankCustomersByCombinedImportance,
  rankCustomersByOpenPipeline,
  rankCustomersByWonValue,
  rankCustomersByWorkOrderExecutionHealth,
} from "@/lib/analytics";
import {
  loadBusinessData,
  type BusinessDataSnapshot,
} from "@/lib/business-data";
import { PublicApiError } from "@/lib/server/errors";
import type {
  AgentResponse,
  AnalyticsResult,
  PeriodSectorResult,
} from "@/types";
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
  const isTimeScoped = Boolean(
    plan.quarter || (plan.period && plan.period !== "all_time"),
  );
  if (!isTimeScoped || plan.intent === "quarter_analysis") return;

  const agentOneQuarterScope =
    plan.intent === "pipeline_overview" || plan.intent === "pipeline_by_sector";
  if (agentOneQuarterScope && plan.period !== "current_year") return;

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

function pipelinePeriodResult(
  snapshot: BusinessDataSnapshot,
  plan: QueryPlan,
  asOfDate: string,
): AnalyticsResult<unknown> | null {
  if (plan.quarter) {
    const data = getPipelineForQuarter(snapshot.deals, plan.quarter);
    return { data, caveats: data.caveats };
  }
  if (plan.period === "current_quarter") {
    const data = getPipelineForCurrentQuarter(snapshot.deals, asOfDate);
    return { data, caveats: data.caveats };
  }
  if (plan.period === "latest_available") {
    const latest = getLatestAvailableQuarter(snapshot.deals, true);
    if (!latest) {
      return {
        data: null,
        caveats: [
          "No usable dated open-pipeline period is available; zero performance is not reported.",
        ],
      };
    }
    const data = getPipelineForQuarter(snapshot.deals, latest);
    return { data, caveats: data.caveats };
  }
  return null;
}

function rankByOpenPipeline<T extends { sector: string; openPipelineValue: number }>(
  metrics: T[],
): T[] {
  return [...metrics].sort(
    (a, b) =>
      b.openPipelineValue - a.openPipelineValue ||
      a.sector.localeCompare(b.sector),
  );
}

function filterSectorPeriod(
  data: PeriodSectorResult,
  sector: string | undefined,
): PeriodSectorResult {
  if (!sector) return data;
  const normalizedSector = sector.toLowerCase();
  const filterSnapshot = (snapshot: PeriodSectorResult["result"]) =>
    snapshot
      ? {
          ...snapshot,
          sectors: snapshot.sectors.filter(
            (metric) => metric.sector.toLowerCase() === normalizedSector,
          ),
        }
      : null;

  const result = filterSnapshot(data.result);
  const latestAvailableResult = filterSnapshot(data.latestAvailableResult);
  const hasSectorMatch = Boolean(
    result?.sectors.length || latestAvailableResult?.sectors.length,
  );

  return {
    ...data,
    result,
    latestAvailableResult,
    caveats: [
      ...data.caveats,
      ...(hasSectorMatch
        ? []
        : [`No deterministic period records matched sector “${sector}”.`]),
    ],
  };
}

function applySectorFocus(
  data: PeriodSectorResult,
  focus: QueryPlan["focus"],
): PeriodSectorResult {
  if (focus !== "sector_open_pipeline") return data;

  const rankSnapshot = (snapshot: PeriodSectorResult["result"]) =>
    snapshot
      ? {
          ...snapshot,
          sectors: rankByOpenPipeline(snapshot.sectors),
        }
      : null;

  return {
    ...data,
    result: rankSnapshot(data.result),
    latestAvailableResult: rankSnapshot(data.latestAvailableResult),
  };
}

function sectorPeriodResult(
  snapshot: BusinessDataSnapshot,
  plan: QueryPlan,
  asOfDate: string,
): AnalyticsResult<unknown> | null {
  let periodResult: PeriodSectorResult | null = null;

  if (plan.quarter) {
    periodResult = getSectorPerformanceForQuarter(snapshot.deals, plan.quarter);
  } else if (plan.period === "current_quarter") {
    periodResult = getSectorPerformanceForCurrentQuarter(
      snapshot.deals,
      asOfDate,
    );
  } else if (plan.period === "latest_available") {
    const latest = getLatestAvailableQuarter(snapshot.deals, false);
    if (!latest) {
      return {
        data: null,
        caveats: [
          "No usable dated sector-performance period is available; zero performance is not reported.",
        ],
      };
    }
    periodResult = getSectorPerformanceForQuarter(snapshot.deals, latest);
  }

  if (!periodResult) return null;
  const selected = applySectorFocus(
    filterSectorPeriod(periodResult, plan.sector),
    plan.focus,
  );
  return { data: selected, caveats: selected.caveats };
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
    case "pipeline_overview": {
      const periodResult = pipelinePeriodResult(snapshot, plan, asOfDate);
      result = periodResult ?? {
        data: calculatePipelineMetrics(snapshot.deals),
        caveats: [],
      };
      break;
    }

    case "won_value":
      result = { data: calculatePipelineMetrics(snapshot.deals), caveats: [] };
      break;

    case "pipeline_by_sector": {
      const scoped = sectorPeriodResult(snapshot, plan, asOfDate);
      if (scoped) {
        result = scoped;
        break;
      }

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
      const focused =
        plan.focus === "sector_open_pipeline"
          ? rankByOpenPipeline(selected)
          : selected;
      result = {
        data: focused,
        caveats:
          plan.sector && focused.length === 0
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

    case "work_order_health": {
      if (plan.focus === "attention") {
        const attention = getFounderAttentionFeed(
          snapshot.deals,
          snapshot.workOrders,
          asOfDate,
        );
        result = { data: attention, caveats: attention.caveats };
        break;
      }
      result = {
        data: calculateWorkOrderHealth(snapshot.workOrders, asOfDate),
        caveats: [],
      };
      break;
    }

    case "receivables":
      result = {
        data: calculateWorkOrderHealth(snapshot.workOrders, asOfDate),
        caveats: [],
      };
      break;

    case "client_cross_board": {
      let ranking;
      switch (plan.focus) {
        case "customer_won_value":
          ranking = rankCustomersByWonValue(snapshot.deals, asOfDate);
          break;
        case "customer_pipeline":
          ranking = rankCustomersByOpenPipeline(snapshot.deals, asOfDate);
          break;
        case "customer_execution":
          ranking = rankCustomersByWorkOrderExecutionHealth(
            snapshot.workOrders,
            asOfDate,
          );
          break;
        case "customer_combined":
          ranking = rankCustomersByCombinedImportance(
            snapshot.deals,
            snapshot.workOrders,
            asOfDate,
          );
          break;
      }

      if (ranking) {
        result = { data: ranking, caveats: ranking.caveats };
        break;
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
    }

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
