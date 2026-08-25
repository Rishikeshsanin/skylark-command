import type { SectorMetrics, WorkOrderHealth } from "@/types/domain";
import { DataState } from "@/components/ui/data-state";
import { DistributionBars } from "@/components/ui/distribution-bars";
import { formatAmount, formatNumber } from "@/components/ui/formatters";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";

type OperationsDashboardProps = { health?: WorkOrderHealth | null; sectors?: SectorMetrics[] | null; currency?: string; loading?: boolean; error?: string | null };

export function OperationsDashboard({ health, sectors, currency, loading = false, error = null }: OperationsDashboardProps) {
  if (loading) return <DataState state="loading" title="Loading Work Order health" />;
  if (error) return <DataState state="error" description={error} />;
  if (!health) return <DataState state="empty" title="Operations view is integration-ready" description="The screen is wired to canonical WorkOrderHealth and SectorMetrics contracts and intentionally shows no synthetic work-order values." />;

  const sectorRows = (sectors ?? []).slice().sort((a, b) => b.workOrderCount - a.workOrderCount).slice(0, 8);
  return (
    <div className="dashboard-stack">
      <div className="metric-grid metric-grid-six">
        <MetricCard label="Active WOs" value={formatNumber(health.activeWorkOrders)} hint={`${formatNumber(health.totalWorkOrders)} total`} />
        <MetricCard label="Completed" value={formatNumber(health.completedWorkOrders)} tone="positive" />
        <MetricCard label="Delayed" value={formatNumber(health.delayedWorkOrders)} tone={health.delayedWorkOrders > 0 ? "warning" : "neutral"} />
        <MetricCard label="AR priority" value={formatNumber(health.arPriorityWorkOrders)} tone={health.arPriorityWorkOrders > 0 ? "warning" : "neutral"} />
        <MetricCard label="Receivables" value={formatAmount(health.receivables, currency)} />
        <MetricCard label="To be billed" value={formatAmount(health.amountToBeBilledInclGst, currency)} />
      </div>

      <div className="split-grid">
        <Panel title="Execution status" description="Current Work Order execution distribution."><DistributionBars items={Object.entries(health.executionStatusDistribution).map(([label, value]) => ({ label, value }))} /></Panel>
        <Panel title="Billing status" description="Billing state distribution from normalized Work Orders."><DistributionBars items={Object.entries(health.billingStatusDistribution).map(([label, value]) => ({ label, value }))} /></Panel>
      </div>

      <div className="split-grid">
        <Panel title="Financial progress" description="Amounts are presented exactly as provided by the WorkOrderHealth contract.">
          <div className="summary-list"><div><span>Total WO value incl. GST</span><strong>{formatAmount(health.totalAmountInclGst, currency)}</strong></div><div><span>Billed incl. GST</span><strong>{formatAmount(health.billedValueInclGst, currency)}</strong></div><div><span>Collected incl. GST</span><strong>{formatAmount(health.collectedAmountInclGst, currency)}</strong></div><div><span>Receivables</span><strong>{formatAmount(health.receivables, currency)}</strong></div><div><span>Unknown receivable values</span><strong>{formatNumber(health.unknownReceivableCount)}</strong></div></div>
        </Panel>
        <Panel title="Work Orders by sector" description="Sector mix by Work Order count."><DistributionBars items={sectorRows.map((sector) => ({ label: sector.sector || "Unmapped", value: sector.workOrderCount, secondary: `${formatNumber(sector.workOrderCount)} WOs · ${formatAmount(sector.receivables, currency)} AR` }))} /></Panel>
      </div>
    </div>
  );
}
