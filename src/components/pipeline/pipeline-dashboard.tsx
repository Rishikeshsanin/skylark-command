import type {
  Deal,
  DealRisk,
  PipelineMetrics,
  QuarterMetric,
  SectorMetrics,
  StageMetric,
} from "@/types/domain";
import { DataState } from "@/components/ui/data-state";
import { CoverageBar } from "@/components/ui/coverage-bar";
import { DistributionBars } from "@/components/ui/distribution-bars";
import { formatAmount, formatAmountFull, formatNumber } from "@/components/ui/formatters";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";

type PipelineDashboardProps = {
  metrics?: PipelineMetrics | null;
  stages?: StageMetric[] | null;
  sectors?: SectorMetrics[] | null;
  risks?: DealRisk[] | null;
  largestDeals?: Deal[] | null;
  quarters?: QuarterMetric[] | null;
  currency?: string;
  loading?: boolean;
  error?: string | null;
};

export function PipelineDashboard({
  metrics,
  stages,
  sectors,
  risks,
  largestDeals,
  quarters,
  currency,
  loading = false,
  error = null,
}: PipelineDashboardProps) {
  if (loading) return <DataState state="loading" title="Loading pipeline intelligence" />;
  if (error) return <DataState state="error" description={error} />;
  if (!metrics) {
    return (
      <DataState
        state="empty"
        title="Pipeline contracts are ready"
        description="This page renders canonical PipelineMetrics, StageMetric, SectorMetrics, and DealRisk values without recomputing analytics in the browser."
      />
    );
  }

  const orderedStages = (stages ?? []).slice().sort((a, b) => b.totalValue - a.totalValue);
  const orderedSectors = (sectors ?? []).slice().sort((a, b) => b.openPipelineValue - a.openPipelineValue);
  const openCoverage = metrics.openDeals
    ? `${formatNumber(metrics.knownOpenValueDeals)} of ${formatNumber(metrics.openDeals)} open opportunities have known values; ${formatNumber(metrics.unknownOpenValueDeals)} are excluded from the monetary total.`
    : "No open opportunities are currently reported.";
  const wonCoverage = metrics.wonDeals
    ? `${formatNumber(metrics.knownWonValueDeals)} of ${formatNumber(metrics.wonDeals)} won deals have known values; ${formatNumber(metrics.unknownWonValueDeals)} are excluded from known won value.`
    : "No won deals are currently reported.";

  return (
    <div className="dashboard-stack">
      <div className="metric-grid metric-grid-five executive-metric-grid">
        <MetricCard label="Known open pipeline" value={formatAmount(metrics.openPipelineValue, currency)} exactValue={formatAmountFull(metrics.openPipelineValue, currency)} hint={openCoverage} />
        <MetricCard label="Active deals" value={formatNumber(metrics.activeDeals)} hint={`${formatNumber(metrics.totalDeals)} total deals`} />
        <MetricCard label="Known won value" value={formatAmount(metrics.wonValue, currency)} exactValue={formatAmountFull(metrics.wonValue, currency)} hint={wonCoverage} tone="positive" />
        <MetricCard label="Avg. open deal" value={formatAmount(metrics.averageOpenDealSize, currency)} exactValue={formatAmountFull(metrics.averageOpenDealSize, currency)} hint={`${formatNumber(metrics.knownOpenValueDeals)} known values`} />
        <MetricCard label="Unknown open values" value={formatNumber(metrics.unknownOpenValueDeals)} hint="Excluded from open-pipeline value and averages" tone={metrics.unknownOpenValueDeals > 0 ? "warning" : "neutral"} />
      </div>

      <div className="split-grid pipeline-overview-grid">
        <Panel title="Value completeness" description="Known monetary totals explicitly exclude opportunities without usable values.">
          <div className="coverage-stack">
            <CoverageBar
              label="Open-deal value coverage"
              known={metrics.knownOpenValueDeals}
              unknown={metrics.unknownOpenValueDeals}
              description={openCoverage}
            />
            <CoverageBar
              label="Won-deal value coverage"
              known={metrics.knownWonValueDeals}
              unknown={metrics.unknownWonValueDeals}
              description={wonCoverage}
            />
          </div>
        </Panel>
        <Panel title="Deal state snapshot" description="Canonical counts are shown independently; the UI does not infer missing status categories.">
          <div className="deal-state-grid" role="list" aria-label="Canonical deal state counts">
            <div role="listitem"><span>Total</span><strong>{formatNumber(metrics.totalDeals)}</strong></div>
            <div role="listitem"><span>Open</span><strong>{formatNumber(metrics.openDeals)}</strong></div>
            <div role="listitem"><span>Active</span><strong>{formatNumber(metrics.activeDeals)}</strong></div>
            <div role="listitem"><span>Won</span><strong>{formatNumber(metrics.wonDeals)}</strong></div>
            <div role="listitem"><span>Dead</span><strong>{formatNumber(metrics.deadDeals)}</strong></div>
          </div>
        </Panel>
      </div>

      <div className="split-grid">
        <Panel title="Pipeline by stage" description="Known value by the normalized deal stage supplied by analytics.">
          <DistributionBars ariaLabel="Known pipeline value by deal stage" items={orderedStages.map((stage, index) => ({ label: stage.stage || "Unmapped", value: stage.totalValue, secondary: `${formatAmount(stage.totalValue, currency)} · ${formatNumber(stage.dealCount)} deals`, detail: `${formatAmountFull(stage.totalValue, currency)} across ${formatNumber(stage.dealCount)} deals`, rank: index + 1, tone: "info" }))} />
        </Panel>
        <Panel title="Pipeline by sector" description="Known open opportunity value by sector.">
          <DistributionBars ariaLabel="Known open pipeline value by sector" items={orderedSectors.slice(0, 8).map((sector, index) => ({ label: sector.sector || "Unmapped", value: sector.openPipelineValue, secondary: `${formatAmount(sector.openPipelineValue, currency)} · ${formatNumber(sector.openDealCount)} open`, detail: `${formatAmountFull(sector.openPipelineValue, currency)} across ${formatNumber(sector.openDealCount)} open opportunities`, rank: index + 1, tone: "info" }))} />
        </Panel>
      </div>

      <div className="split-grid">
        <Panel title="Largest open deals" description="Top open opportunities ranked by the canonical analytics function; records without known deal values are not assigned a monetary amount.">
          {largestDeals?.length ? <div className="compact-list">{largestDeals.slice(0, 8).map((deal) => <div key={deal.mondayItemId}><div><strong>{deal.name}</strong><span>{deal.normalizedClientKey ?? deal.clientCode ?? "Client unavailable"} · {deal.stage ?? "Stage unavailable"}</span></div><div className="compact-value"><strong title={formatAmountFull(deal.value, currency)}>{formatAmount(deal.value, currency)}</strong><span>{formatAmountFull(deal.value, currency)} · {deal.tentativeCloseDate ?? deal.closeDate ?? "Close date unavailable"}</span></div></div>)}</div> : <p className="muted-copy">No ranked open deals were supplied.</p>}
        </Panel>
        <Panel title="Close-date distribution" description="Known deal value grouped by canonical close quarter.">
          <DistributionBars ariaLabel="Known deal value by close quarter" items={(quarters ?? []).map((quarter) => ({ label: quarter.quarter, value: quarter.totalValue, secondary: `${formatAmount(quarter.totalValue, currency)} · ${formatNumber(quarter.dealCount)} deals`, detail: `${formatAmountFull(quarter.totalValue, currency)} across ${formatNumber(quarter.dealCount)} deals` }))} emptyLabel="No valid close-date distribution is available." />
        </Panel>
      </div>

      <Panel title="Deals needing attention" description="Risk reasons are supplied by deterministic analytics; the UI only presents them.">
        {risks?.length ? (
          <div className="risk-list">
            {risks.slice(0, 10).map((risk) => (
              <article className="risk-row" key={risk.mondayItemId}>
                <div className="risk-copy"><div className="risk-heading"><strong>{risk.name}</strong><StatusPill tone="warning">Attention</StatusPill></div><p>{risk.normalizedClientKey ?? "Client unavailable"} · {risk.stage ?? "Stage unavailable"}</p><ul>{risk.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
                <div className="risk-value"><span>Deal value</span><strong>{formatAmount(risk.value, currency)}</strong></div>
              </article>
            ))}
          </div>
        ) : <p className="muted-copy">No deal risks were supplied for this view.</p>}
      </Panel>
    </div>
  );
}
