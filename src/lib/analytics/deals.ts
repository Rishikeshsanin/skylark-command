import type {
  Deal,
  DealConcentration,
  DealRisk,
  PipelineMetrics,
  QuarterMetric,
  StageMetric,
} from "../../types";
import { isActiveDeal, isDeadDeal, isOpenDeal, isWonDeal, normalizeLabel, roundAmount, sumKnown } from "./helpers";

function usableDeals(deals: Deal[]): Deal[] {
  return deals.filter((deal) => !deal.malformed);
}

export function calculatePipelineMetrics(deals: Deal[]): PipelineMetrics {
  const valid = usableDeals(deals);
  const open = valid.filter(isOpenDeal);
  const won = valid.filter(isWonDeal);
  const knownOpenValues = open.filter((deal) => deal.value !== null);
  const knownWonValues = won.filter((deal) => deal.value !== null);

  return {
    totalDeals: valid.length,
    openDeals: open.length,
    activeDeals: valid.filter(isActiveDeal).length,
    wonDeals: won.length,
    deadDeals: valid.filter(isDeadDeal).length,
    openPipelineValue: sumKnown(open.map((deal) => deal.value)),
    wonValue: sumKnown(won.map((deal) => deal.value)),
    averageOpenDealSize:
      knownOpenValues.length > 0
        ? roundAmount(sumKnown(knownOpenValues.map((deal) => deal.value)) / knownOpenValues.length)
        : null,
    knownOpenValueDeals: knownOpenValues.length,
    unknownOpenValueDeals: open.length - knownOpenValues.length,
    knownWonValueDeals: knownWonValues.length,
    unknownWonValueDeals: won.length - knownWonValues.length,
  };
}

export function pipelineByStage(deals: Deal[], openOnly = true): StageMetric[] {
  const source = usableDeals(deals).filter((deal) => !openOnly || isOpenDeal(deal));
  const groups = new Map<string, Deal[]>();

  for (const deal of source) {
    const key = deal.stage?.trim() || "Unknown";
    groups.set(key, [...(groups.get(key) ?? []), deal]);
  }

  return [...groups.entries()]
    .map(([stage, rows]) => ({
      stage,
      dealCount: rows.length,
      knownValueDealCount: rows.filter((row) => row.value !== null).length,
      unknownValueDealCount: rows.filter((row) => row.value === null).length,
      totalValue: sumKnown(rows.map((row) => row.value)),
    }))
    .sort((a, b) => b.totalValue - a.totalValue || b.dealCount - a.dealCount || a.stage.localeCompare(b.stage));
}

export function largestDeals(deals: Deal[], limit = 10, openOnly = true): Deal[] {
  return usableDeals(deals)
    .filter((deal) => !openOnly || isOpenDeal(deal))
    .filter((deal) => deal.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, limit));
}

export function dealCloseQuarterMetrics(deals: Deal[], openOnly = false): QuarterMetric[] {
  const groups = new Map<string, Deal[]>();
  for (const deal of usableDeals(deals)) {
    if (openOnly && !isOpenDeal(deal)) continue;
    const date = deal.closeDate ?? deal.tentativeCloseDate;
    if (!date) continue;
    const [yearText, monthText] = date.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) continue;
    const quarter = `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
    groups.set(quarter, [...(groups.get(quarter) ?? []), deal]);
  }

  return [...groups.entries()]
    .map(([quarter, rows]) => ({
      quarter,
      dealCount: rows.length,
      knownValueDealCount: rows.filter((row) => row.value !== null).length,
      totalValue: sumKnown(rows.map((row) => row.value)),
    }))
    .sort((a, b) => {
      const [qa, ya] = a.quarter.split(" ");
      const [qb, yb] = b.quarter.split(" ");
      return Number(ya) - Number(yb) || Number(qa.slice(1)) - Number(qb.slice(1));
    });
}

export function findRiskyDeals(deals: Deal[], asOfDate: string): DealRisk[] {
  const asOf = Date.parse(`${asOfDate}T00:00:00Z`);
  const risks: DealRisk[] = [];

  for (const deal of usableDeals(deals)) {
    if (!isActiveDeal(deal)) continue;
    const reasons: string[] = [];
    const status = normalizeLabel(deal.status);
    const stage = normalizeLabel(deal.stage);

    if (status === "on hold" || stage.includes("projects on hold")) reasons.push("on hold");
    if (status === "stuck") reasons.push("status is stuck");
    if (deal.tentativeCloseDate && Date.parse(`${deal.tentativeCloseDate}T00:00:00Z`) < asOf) {
      reasons.push("tentative close date is in the past");
    }
    if (deal.value === null) reasons.push("deal value is missing");

    if (reasons.length > 0) {
      risks.push({
        mondayItemId: deal.mondayItemId,
        name: deal.name,
        normalizedClientKey: deal.normalizedClientKey,
        value: deal.value,
        stage: deal.stage,
        status: deal.status,
        tentativeCloseDate: deal.tentativeCloseDate,
        reasons,
      });
    }
  }

  return risks.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.name.localeCompare(b.name));
}

export function calculateDealConcentration(deals: Deal[]): DealConcentration {
  const openKnown = usableDeals(deals).filter((deal) => isOpenDeal(deal) && deal.value !== null);
  const totals = new Map<string, number>();
  for (const deal of openKnown) {
    const key = deal.normalizedClientKey ?? `UNMAPPED:${deal.mondayItemId}`;
    totals.set(key, (totals.get(key) ?? 0) + (deal.value ?? 0));
  }

  const values = [...totals.values()].sort((a, b) => b - a);
  const total = roundAmount(values.reduce((sum, value) => sum + value, 0));
  const topClientValue = roundAmount(values[0] ?? 0);
  const topFiveClientValue = roundAmount(values.slice(0, 5).reduce((sum, value) => sum + value, 0));

  return {
    knownOpenPipelineValue: total,
    topClientValue,
    topClientShare: total > 0 ? roundAmount(topClientValue / total) : null,
    topFiveClientValue,
    topFiveClientShare: total > 0 ? roundAmount(topFiveClientValue / total) : null,
  };
}
