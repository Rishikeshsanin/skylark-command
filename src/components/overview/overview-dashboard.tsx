import type { ClientIntelligence, DataQualityReport, PipelineMetrics, SectorMetrics, WorkOrderHealth } from "@/types/domain";
import { DataState } from "@/components/ui/data-state";
import { DistributionBars } from "@/components/ui/distribution-bars";
import { formatAmount, formatNumber } from "@/components/ui/formatters";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";

type OverviewDashboardProps = {
  pipeline?: PipelineMetrics | null;
  workOrders?: WorkOrderHealth | null;
  sectors?: SectorMetrics[] | null;
  clients?: ClientIntelligence[] | null;
  dataQuality?: DataQualityReport | null;
  currency?: string;
  loading?: boolean;
  error?: string | null;
};

export function OverviewDashboard({ pipeline, workOrders, sectors, clients, dataQuality, currency, loading = false, error = null }: OverviewDashboardProps) {
  if (loading) return <DataState state="loading" />;
  if (error) return <DataState state="error" description={error} />;
  if (!pipeline || !workOrders) {
    return <DataState state="empty" title="Executive metrics are integration-ready" description="The Overview is typed against PipelineMetrics, WorkOrderHealth, SectorMetrics, ClientIntelligence, and DataQualityReport. It will populate once the live BI endpoint is available." />;
  }

  const exposedClients = clients?.filter((client) => client.hasCombinedCommercialOperationalRisk) ?? [];
  const sectorRows = (sectors ?? []).slice().sort((a, b) => b.openPipelineValue - a.openPipelineValue).slice(0, 6);

  return (
    <div className="dashboard-stack">
      <div className="metric-grid metric-grid-six">
        <MetricCard label="Active pipeline" value={formatAmount(pipeline.openPipelineValue, currency)} hint={`${formatNumber(pipeline.openDeals)} open deals`} />
        <MetricCard label="Won value" value={formatAmount(pipeline.wonValue, currency)} hint={`${formatNumber(pipeline.wonDeals)} won deals`} tone="positive" />
        <MetricCard label="Active work orders" value={formatNumber(workOrders.activeWorkOrders)} hint={`${formatNumber(workOrders.totalWorkOrders)} total`} />
        <MetricCard label="Delayed work orders" value={formatNumber(workOrders.delayedWorkOrders)} hint={`${formatNumber(workOrders.pausedWorkOrders)} paused`} tone={workOrders.delayedWorkOrders > 0 ? "warning" : "neutral"} />
        <MetricCard label="Receivables" value={formatAmount(workOrders.receivables, currency)} hint={`${formatNumber(workOrders.arPriorityWorkOrders)} AR-priority WOs`} />
        <MetricCard label="Data warnings" value={dataQuality ? formatNumber(dataQuality.issueCounts.warning) : "—"} hint={dataQuality ? `${formatNumber(dataQuality.issueCounts.error)} errors reported` : "Quality report unavailable"} tone={dataQuality && dataQuality.issueCounts.warning > 0 ? "warning" : "neutral"} />
      </div>

      <div className="split-grid">
        <Panel title="Pipeline by sector" description="Open pipeline value across the leading sectors.">
          <DistributionBars items={sectorRows.map((sector) => ({ label: sector.sector || "Unmapped", value: sector.openPipelineValue, secondary: formatAmount(sector.openPipelineValue, currency) }))} emptyLabel="No sector metrics available." />
        </Panel>
        <Panel title="Operational posture" description="Execution and billing signals from Work Orders.">
          <div className="summary-list">
            <div><span>Ongoing</span><strong>{formatNumber(workOrders.ongoingWorkOrders)}</strong></div>
            <div><span>Not started</span><strong>{formatNumber(workOrders.notStartedWorkOrders)}</strong></div>
            <div><span>Delayed</span><strong>{formatNumber(workOrders.delayedWorkOrders)}</strong></div>
            <div><span>Paused</span><strong>{formatNumber(workOrders.pausedWorkOrders)}</strong></div>
            <div><span>Amount to be billed</span><strong>{formatAmount(workOrders.amountToBeBilledInclGst, currency)}</strong></div>
          </div>
        </Panel>
      </div>

      <Panel title="Leadership attention" description="Clients with simultaneous commercial opportunity and operational exposure.">
        {exposedClients.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Client</th><th>Open deals</th><th>Active WOs</th><th>Receivables</th><th>Signal</th></tr></thead>
              <tbody>{exposedClients.slice(0, 8).map((client) => (
                <tr key={client.normalizedClientKey}>
                  <td><strong>{client.normalizedClientKey}</strong><small>{client.sectors.join(", ") || "Sector unavailable"}</small></td>
                  <td>{formatNumber(client.openDealCount)}</td>
                  <td>{formatNumber(client.activeWorkOrderCount)}</td>
                  <td>{formatAmount(client.receivables, currency)}</td>
                  <td><StatusPill tone="warning">Review</StatusPill></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="muted-copy">No combined commercial and operational exposure is currently reported.</p>}
      </Panel>
    </div>
  );
}
