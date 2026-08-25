import type {
  ClientIntelligence,
  DataQualityReport,
  FounderAttentionFeed,
  PipelineMetrics,
  SectorMetrics,
  WorkOrderHealth,
} from "@/types";
import { DataState } from "@/components/ui/data-state";
import { DistributionBars } from "@/components/ui/distribution-bars";
import { formatAmount, formatNumber } from "@/components/ui/formatters";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { FounderAttention } from "./founder-attention";

type OverviewDashboardProps = {
  pipeline?: PipelineMetrics | null;
  workOrders?: WorkOrderHealth | null;
  sectors?: SectorMetrics[] | null;
  clients?: ClientIntelligence[] | null;
  dataQuality?: DataQualityReport | null;
  attentionFeed?: FounderAttentionFeed | null;
  currency?: string;
  loading?: boolean;
  error?: string | null;
};

export function OverviewDashboard({
  pipeline,
  workOrders,
  sectors,
  clients,
  dataQuality,
  attentionFeed,
  currency,
  loading = false,
  error = null,
}: OverviewDashboardProps) {
  if (loading) return <DataState state="loading" />;
  if (error) return <DataState state="error" description={error} />;
  if (!pipeline || !workOrders) {
    return (
      <DataState
        state="empty"
        title="Executive metrics are integration-ready"
        description="The Overview consumes canonical pipeline, operations, sector, client, data-quality, and Founder Attention data without inventing business metrics."
      />
    );
  }

  const resolvedCurrency = attentionFeed?.currencyCode ?? currency;
  const exposedClients =
    clients?.filter((client) => client.hasCombinedCommercialOperationalRisk) ?? [];
  const sectorRows = (sectors ?? [])
    .slice()
    .sort((a, b) => b.openPipelineValue - a.openPipelineValue)
    .slice(0, 6);
  const valueCoverage = pipeline.openDeals
    ? `${formatNumber(pipeline.knownOpenValueDeals)} of ${formatNumber(pipeline.openDeals)} open opportunities have known values.`
    : "No open opportunities are currently reported.";

  return (
    <div className="dashboard-stack">
      <div className="metric-grid metric-grid-six executive-metric-grid">
        <MetricCard
          label="Open pipeline"
          value={formatAmount(pipeline.openPipelineValue, resolvedCurrency)}
          hint={valueCoverage}
        />
        <MetricCard
          label="Won value"
          value={formatAmount(pipeline.wonValue, resolvedCurrency)}
          hint={`${formatNumber(pipeline.wonDeals)} won deals`}
          tone="positive"
        />
        <MetricCard
          label="Active work orders"
          value={formatNumber(workOrders.activeWorkOrders)}
          hint={`${formatNumber(workOrders.totalWorkOrders)} total`}
        />
        <MetricCard
          label="Delayed work orders"
          value={formatNumber(workOrders.delayedWorkOrders)}
          hint={`${formatNumber(workOrders.pausedWorkOrders)} paused`}
          tone={workOrders.delayedWorkOrders > 0 ? "warning" : "neutral"}
        />
        <MetricCard
          label="Receivables"
          value={formatAmount(workOrders.receivables, resolvedCurrency)}
          hint={`${formatNumber(workOrders.unknownReceivableCount)} unknown receivable values`}
        />
        <MetricCard
          label="Data warnings"
          value={dataQuality ? formatNumber(dataQuality.issueCounts.warning) : "—"}
          hint={
            dataQuality
              ? `${formatNumber(dataQuality.issueCounts.error)} errors · ${formatNumber(dataQuality.unmappedWorkOrderClients)} unmapped WO clients`
              : "Quality report unavailable"
          }
          tone={dataQuality && dataQuality.issueCounts.warning > 0 ? "warning" : "neutral"}
        />
      </div>

      <div className="confidence-band" role="note" aria-label="Data confidence">
        <div>
          <span className="confidence-label">Data confidence</span>
          <strong>{valueCoverage}</strong>
        </div>
        <div>
          <span>Records analyzed</span>
          <strong>{attentionFeed ? formatNumber(attentionFeed.provenance.totalRecordsAnalyzed) : "—"}</strong>
        </div>
        <div>
          <span>Missing open-deal values</span>
          <strong>{formatNumber(pipeline.unknownOpenValueDeals)}</strong>
        </div>
      </div>

      <div className="split-grid">
        <Panel title="Pipeline by sector" description="Open pipeline value across the leading sectors.">
          <DistributionBars
            items={sectorRows.map((sector) => ({
              label: sector.sector || "Unmapped",
              value: sector.openPipelineValue,
              secondary: formatAmount(sector.openPipelineValue, resolvedCurrency),
            }))}
            emptyLabel="No sector metrics available."
          />
        </Panel>
        <Panel title="Operational posture" description="Execution and billing signals from Work Orders.">
          <div className="summary-list">
            <div><span>Ongoing</span><strong>{formatNumber(workOrders.ongoingWorkOrders)}</strong></div>
            <div><span>Not started</span><strong>{formatNumber(workOrders.notStartedWorkOrders)}</strong></div>
            <div><span>Delayed</span><strong>{formatNumber(workOrders.delayedWorkOrders)}</strong></div>
            <div><span>Paused</span><strong>{formatNumber(workOrders.pausedWorkOrders)}</strong></div>
            <div><span>Amount to be billed</span><strong>{formatAmount(workOrders.amountToBeBilledInclGst, resolvedCurrency)}</strong></div>
          </div>
        </Panel>
      </div>

      <FounderAttention
        feed={attentionFeed}
        fallbackClients={exposedClients}
        currency={resolvedCurrency}
      />
    </div>
  );
}
