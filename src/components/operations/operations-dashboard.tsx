import type { SectorMetrics, WorkOrderHealth } from "@/types/domain";
import { DataState } from "@/components/ui/data-state";
import { DistributionBars } from "@/components/ui/distribution-bars";
import { FinancialFlow } from "@/components/ui/financial-flow";
import { formatAmount, formatAmountFull, formatNumber } from "@/components/ui/formatters";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";

type OperationsDashboardProps = {
  health?: WorkOrderHealth | null;
  sectors?: SectorMetrics[] | null;
  currency?: string;
  loading?: boolean;
  error?: string | null;
};

export function OperationsDashboard({
  health,
  sectors,
  currency,
  loading = false,
  error = null,
}: OperationsDashboardProps) {
  if (loading) return <DataState state="loading" title="Loading Work Order health" />;
  if (error) return <DataState state="error" description={error} />;
  if (!health) return <DataState state="empty" title="Operations view is integration-ready" description="The screen is wired to canonical WorkOrderHealth and SectorMetrics contracts and intentionally shows no synthetic work-order values." />;

  const sectorRows = (sectors ?? []).slice().sort((a, b) => b.workOrderCount - a.workOrderCount).slice(0, 8);
  const receivableCoverage = health.unknownReceivableCount
    ? `${formatNumber(health.unknownReceivableCount)} Work Orders have unknown receivable values and are excluded from the known total.`
    : "No Work Orders have unknown receivable values.";

  return (
    <div className="dashboard-stack">
      <div className="metric-grid metric-grid-six executive-metric-grid">
        <MetricCard label="Active WOs" value={formatNumber(health.activeWorkOrders)} hint={`${formatNumber(health.totalWorkOrders)} total`} />
        <MetricCard label="Completed" value={formatNumber(health.completedWorkOrders)} tone="positive" />
        <MetricCard label="Delayed" value={formatNumber(health.delayedWorkOrders)} tone={health.delayedWorkOrders > 0 ? "warning" : "neutral"} />
        <MetricCard label="AR priority" value={formatNumber(health.arPriorityWorkOrders)} tone={health.arPriorityWorkOrders > 0 ? "warning" : "neutral"} />
        <MetricCard label="Known receivables" value={formatAmount(health.receivables, currency)} exactValue={formatAmountFull(health.receivables, currency)} hint={receivableCoverage} />
        <MetricCard label="Known to be billed" value={formatAmount(health.amountToBeBilledInclGst, currency)} exactValue={formatAmountFull(health.amountToBeBilledInclGst, currency)} />
      </div>

      <div className="confidence-band" role="note" aria-label="Operations data confidence">
        <div><span className="confidence-label">Receivable coverage</span><strong>{receivableCoverage}</strong></div>
        <div><span>Unknown receivables</span><strong>{formatNumber(health.unknownReceivableCount)}</strong></div>
        <div><span>Unknown Work Order amounts</span><strong>{formatNumber(health.unknownAmountCount)}</strong></div>
      </div>

      <div className="split-grid">
        <Panel title="Execution status" description="Current Work Order execution distribution."><DistributionBars ariaLabel="Work Order execution status distribution" items={Object.entries(health.executionStatusDistribution).map(([label, value]) => ({ label, value }))} /></Panel>
        <Panel title="Billing status" description="Billing state distribution from normalized Work Orders."><DistributionBars ariaLabel="Work Order billing status distribution" items={Object.entries(health.billingStatusDistribution).map(([label, value]) => ({ label, value }))} /></Panel>
      </div>

      <div className="split-grid">
        <Panel title="Financial flow" description="A visual reading of supplied Work Order values from total amount through billing and collection.">
          <FinancialFlow
            totalAmount={health.totalAmountInclGst}
            billed={health.billedValueInclGst}
            collected={health.collectedAmountInclGst}
            toBeBilled={health.amountToBeBilledInclGst}
            receivables={health.receivables}
            currency={currency}
          />
        </Panel>
        <Panel title="Work Orders by sector" description="Sector mix by Work Order count."><DistributionBars ariaLabel="Work Order count by sector" items={sectorRows.map((sector) => ({ label: sector.sector || "Unmapped", value: sector.workOrderCount, secondary: `${formatNumber(sector.workOrderCount)} WOs · ${formatAmount(sector.receivables, currency)} AR`, detail: `${formatNumber(sector.workOrderCount)} Work Orders and ${formatAmountFull(sector.receivables, currency)} known receivables` }))} /></Panel>
      </div>
    </div>
  );
}
