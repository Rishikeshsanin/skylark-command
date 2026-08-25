import type {
  Deal,
  DealRisk,
  PipelineMetrics,
  QuarterMetric,
  SectorMetrics,
  StageMetric,
} from "@/types/domain";
import { DataState } from "@/components/ui/data-state";
import { DistributionBars } from "@/components/ui/distribution-bars";
import { formatAmount, formatNumber } from "@/components/ui/formatters";
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
  const coverage = metrics.openDeals
    ? `${formatNumber(metrics.knownOpenValueDeals)} of ${formatNumber(metrics.openDeals)} open opportunities have known values.`
    : "No open opportunities are currently reported.";

  return (
    <div className="dashboard-stack">
      <div className="metric-grid metric-grid-five executive-metric-grid">
        <MetricCard label="Open pipeline" value={formatAmount(metrics.openPipelineValue, currency)} hint={coverage} />
        <MetricCard label="Active deals" value={formatNumber(metrics.activeDeals)} hint={`${formatNumber(metrics.totalDeals)} total deals`} />
        <MetricCard label="Won value" value={formatAmount(metrics.wonValue, currency)} hint={`${formatNumber(metrics.wonDeals)} won`} tone="positive" />
        <MetricCard label="Avg. open deal" value={formatAmount(metrics.averageOpenDealSize, currency)} hint={`${formatNumber(metrics.knownOpenValueDeals)} known values`} />
        <MetricCard label="Unknown values" value={formatNumber(metrics.unknownOpenValueDeals)} hint="Open deals excluded from value averages" tone={metrics.unknownOpenValueDeals > 0 ? "warning" : "neutral"} />
      </div>

      <div className="confidence-band" role="note" aria-label="Pipeline data confidence">
        <div><span className="confidence-label">Value coverage</span><strong>{coverage}</strong></div>
        <div><span>Known open values</span><strong>{formatNumber(metrics.knownOpenValueDeals)}</strong></div>
        <div><span>Missing open values</span><strong>{formatNumber(metrics.unknownOpenValueDeals)}</strong></div>
      </div>

      <div className="split-grid">
        <Panel title="Pipeline by stage" description="Known value by the normalized deal stage supplied by analytics.">
          <DistributionBars items={orderedStages.map((stage) => ({ label: stage.stage || "Unmapped", value: stage.totalValue, secondary: `${formatAmount(stage.totalValue, currency)} · ${formatNumber(stage.dealCount)} deals` }))} />
        </Panel>
        <Panel title="Pipeline by sector" description="Open opportunity value by sector.">
          <DistributionBars items={orderedSectors.slice(0, 8).map((sector) => ({ label: sector.sector || "Unmapped", value: sector.openPipelineValue, secondary: `${formatAmount(sector.openPipelineValue, currency)} · ${formatNumber(sector.openDealCount)} open` }))} />
        </Panel>
      </div>

      <div className="split-grid">
        <Panel title="Largest open deals" description="Top open opportunities ranked by the canonical analytics function.">
          {largestDeals?.length ? <div className="compact-list">{largestDeals.slice(0, 8).map((deal) => <div key={deal.mondayItemId}><div><strong>{deal.name}</strong><span>{deal.normalizedClientKey ?? deal.clientCode ?? "Client unavailable"} · {deal.stage ?? "Stage unavailable"}</span></div><div className="compact-value"><strong>{formatAmount(deal.value, currency)}</strong><span>{deal.tentativeCloseDate ?? deal.closeDate ?? "Close date unavailable"}</span></div></div>)}</div> : <p className="muted-copy">No ranked open deals were supplied.</p>}
        </Panel>
        <Panel title="Close-date distribution" description="Open deal value grouped by canonical close quarter.">
          <DistributionBars items={(quarters ?? []).map((quarter) => ({ label: quarter.quarter, value: quarter.totalValue, secondary: `${formatAmount(quarter.totalValue, currency)} · ${formatNumber(quarter.dealCount)} deals` }))} emptyLabel="No valid close-date distribution is available." />
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
