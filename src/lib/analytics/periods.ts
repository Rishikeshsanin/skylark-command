import type {
  Deal,
  PeriodPipelineResult,
  PeriodPipelineSnapshot,
  PeriodSectorResult,
  PeriodSectorSnapshot,
  SectorPeriodMetric,
} from "../../types";
import { calculatePipelineMetrics } from "./deals";
import { isOpenDeal, isWonDeal, sumKnown } from "./helpers";

function usableDeals(deals: Deal[]): Deal[] {
  return deals.filter((deal) => !deal.malformed);
}

export function getDealPeriodDate(deal: Deal): string | null {
  return deal.closeDate ?? deal.tentativeCloseDate;
}

export function quarterForDate(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || Number.isNaN(timestamp)) return null;
  const parsed = new Date(timestamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) return null;
  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}

export function getCurrentQuarter(asOfDate: string): string {
  const quarter = quarterForDate(asOfDate);
  if (!quarter) throw new Error("asOfDate must be a valid YYYY-MM-DD calendar date.");
  return quarter;
}

function parseQuarter(quarter: string): { year: number; quarter: number } {
  const match = /^Q([1-4]) (\d{4})$/.exec(quarter.trim());
  if (!match) throw new Error("Quarter must use canonical format such as Q3 2026.");
  return { quarter: Number(match[1]), year: Number(match[2]) };
}

function compareQuarter(a: string, b: string): number {
  const qa = parseQuarter(a);
  const qb = parseQuarter(b);
  return qa.year - qb.year || qa.quarter - qb.quarter;
}

function dealQuarter(deal: Deal): string | null {
  const date = getDealPeriodDate(deal);
  return date ? quarterForDate(date) : null;
}

export function getLatestAvailableQuarter(deals: Deal[], openOnly = false): string | null {
  const periods = new Set<string>();
  for (const deal of usableDeals(deals)) {
    if (openOnly && !isOpenDeal(deal)) continue;
    const quarter = dealQuarter(deal);
    if (quarter) periods.add(quarter);
  }
  return [...periods].sort(compareQuarter).at(-1) ?? null;
}

function pipelineSnapshot(deals: Deal[], period: string): PeriodPipelineSnapshot {
  const rows = usableDeals(deals).filter((deal) => isOpenDeal(deal) && dealQuarter(deal) === period);
  return {
    period,
    recordsAnalyzed: rows.length,
    pipeline: calculatePipelineMetrics(rows),
    currencyCode: "INR",
    provenance: {
      dealRecordsAnalyzed: rows.length,
      workOrderRecordsAnalyzed: 0,
      totalRecordsAnalyzed: rows.length,
    },
  };
}

export function getPipelineForQuarter(deals: Deal[], requestedPeriod: string): PeriodPipelineResult {
  parseQuarter(requestedPeriod);
  const validOpen = usableDeals(deals).filter(isOpenDeal);
  const missingPeriod = validOpen.filter((deal) => !dealQuarter(deal)).length;
  const requested = pipelineSnapshot(deals, requestedPeriod);
  const latestAvailablePeriod = getLatestAvailableQuarter(deals, true);
  const hasData = requested.recordsAnalyzed > 0;
  const caveats: string[] = [
    "Deal quarter uses actual close date when present, otherwise the source tentative close date; no date is fabricated.",
  ];
  if (missingPeriod > 0) caveats.push(`${missingPeriod} open deal record(s) have no usable close/tentative close date and are excluded from period analytics.`);
  if (!hasData) caveats.push("No usable open-pipeline records exist in the requested quarter; zero is not reported as quarter performance.");
  if (hasData && requested.pipeline.knownOpenValueDeals === 0 && requested.pipeline.unknownOpenValueDeals > 0) {
    caveats.push("Matching open deals exist, but all matching monetary values are missing; the known-value total must not be interpreted as complete performance.");
  } else if (hasData && requested.pipeline.unknownOpenValueDeals > 0) {
    caveats.push(`${requested.pipeline.unknownOpenValueDeals} matching open deal(s) have missing monetary values and are excluded from the monetary total.`);
  }

  const latestAvailableResult = !hasData && latestAvailablePeriod && latestAvailablePeriod !== requestedPeriod
    ? pipelineSnapshot(deals, latestAvailablePeriod)
    : null;

  return {
    requestedPeriod,
    hasData,
    recordsAnalyzed: requested.recordsAnalyzed,
    result: hasData ? requested : null,
    latestAvailablePeriod,
    latestAvailableResult,
    currencyCode: "INR",
    provenance: requested.provenance,
    caveats,
  };
}

export function getPipelineForCurrentQuarter(deals: Deal[], asOfDate: string): PeriodPipelineResult {
  return getPipelineForQuarter(deals, getCurrentQuarter(asOfDate));
}

function sectorRowsForPeriod(deals: Deal[], period: string): Deal[] {
  return usableDeals(deals).filter((deal) => dealQuarter(deal) === period);
}

function buildSectorMetrics(rows: Deal[]): SectorPeriodMetric[] {
  const groups = new Map<string, Deal[]>();
  for (const deal of rows) {
    const sector = deal.sector?.trim() || "Unknown";
    groups.set(sector, [...(groups.get(sector) ?? []), deal]);
  }

  return [...groups.entries()]
    .map(([sector, sectorDeals]) => {
      const open = sectorDeals.filter(isOpenDeal);
      const won = sectorDeals.filter(isWonDeal);
      return {
        sector,
        dealCount: sectorDeals.length,
        openDealCount: open.length,
        wonDealCount: won.length,
        knownValueDealCount: sectorDeals.filter((deal) => deal.value !== null).length,
        unknownValueDealCount: sectorDeals.filter((deal) => deal.value === null).length,
        openPipelineValue: sumKnown(open.map((deal) => deal.value)),
        wonValue: sumKnown(won.map((deal) => deal.value)),
        totalKnownDealValue: sumKnown(sectorDeals.map((deal) => deal.value)),
      };
    })
    .sort((a, b) => b.totalKnownDealValue - a.totalKnownDealValue || b.dealCount - a.dealCount || a.sector.localeCompare(b.sector));
}

function sectorSnapshot(deals: Deal[], period: string): PeriodSectorSnapshot {
  const rows = sectorRowsForPeriod(deals, period);
  return {
    period,
    recordsAnalyzed: rows.length,
    sectors: buildSectorMetrics(rows),
    currencyCode: "INR",
    provenance: {
      dealRecordsAnalyzed: rows.length,
      workOrderRecordsAnalyzed: 0,
      totalRecordsAnalyzed: rows.length,
    },
  };
}

export function getSectorPerformanceForQuarter(deals: Deal[], requestedPeriod: string): PeriodSectorResult {
  parseQuarter(requestedPeriod);
  const valid = usableDeals(deals);
  const missingPeriod = valid.filter((deal) => !dealQuarter(deal)).length;
  const requested = sectorSnapshot(deals, requestedPeriod);
  const latestAvailablePeriod = getLatestAvailableQuarter(deals, false);
  const hasData = requested.recordsAnalyzed > 0;
  const caveats: string[] = [
    "Sector period performance is Deal-based and uses actual close date when present, otherwise the source tentative close date.",
  ];
  if (missingPeriod > 0) caveats.push(`${missingPeriod} deal record(s) have no usable close/tentative close date and are excluded from period analytics.`);
  if (!hasData) caveats.push("No usable deal records exist in the requested quarter; zero sector performance is not reported.");
  if (hasData && requested.sectors.some((sector) => sector.unknownValueDealCount > 0)) {
    caveats.push("At least one matching sector contains deals with missing monetary values; monetary totals sum known values only.");
  }
  const latestAvailableResult = !hasData && latestAvailablePeriod && latestAvailablePeriod !== requestedPeriod
    ? sectorSnapshot(deals, latestAvailablePeriod)
    : null;

  return {
    requestedPeriod,
    hasData,
    recordsAnalyzed: requested.recordsAnalyzed,
    result: hasData ? requested : null,
    latestAvailablePeriod,
    latestAvailableResult,
    currencyCode: "INR",
    provenance: requested.provenance,
    caveats,
  };
}

export function getSectorPerformanceForCurrentQuarter(deals: Deal[], asOfDate: string): PeriodSectorResult {
  return getSectorPerformanceForQuarter(deals, getCurrentQuarter(asOfDate));
}
