import type { Customer360 } from "@/types";
import { formatAmountFull, formatDateTime, formatNumber } from "@/components/ui/formatters";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";

export function Customer360View({ customer }: { customer: Customer360 }) {
  return (
    <div className="dashboard-stack customer-360-layout">
      <div className="metric-grid metric-grid-six">
        <article className="metric-card">
          <p className="metric-label">Open deals</p>
          <p className="metric-value">{formatNumber(customer.commercial.openDeals.length)}</p>
          <p className="metric-hint">{formatAmountFull(customer.commercial.knownOpenPipelineValue, "INR")} known pipeline</p>
        </article>
        <article className="metric-card metric-card-positive">
          <p className="metric-label">Won deals</p>
          <p className="metric-value">{formatNumber(customer.commercial.wonDeals.length)}</p>
          <p className="metric-hint">{formatAmountFull(customer.commercial.knownWonValue, "INR")} known won value</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Active Work Orders</p>
          <p className="metric-value">{formatNumber(customer.operations.activeWorkOrders)}</p>
          <p className="metric-hint">{formatNumber(customer.operations.totalWorkOrders)} total</p>
        </article>
        <article className="metric-card metric-card-warning">
          <p className="metric-label">Delayed / paused</p>
          <p className="metric-value">{formatNumber(customer.operations.delayedWorkOrders)} / {formatNumber(customer.operations.pausedWorkOrders)}</p>
          <p className="metric-hint">Deterministic execution-state checks</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Receivables</p>
          <p className="metric-value customer-money-value">{formatAmountFull(customer.cash.receivables, "INR")}</p>
          <p className="metric-hint">{formatNumber(customer.cash.unknownReceivableRecords)} unknown receivable records</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Cross-board trust</p>
          <p className="metric-value customer-trust-value">{customer.trust.matchedAcrossBoards ? "Matched" : "Partial"}</p>
          <p className="metric-hint">Exact normalized client identity only</p>
        </article>
      </div>

      <div className="split-grid">
        <Panel title="Commercial" description="Deals, stages, known pipeline and deal history.">
          <div className="summary-list">
            <div><span>Known open pipeline</span><strong>{formatAmountFull(customer.commercial.knownOpenPipelineValue, "INR")}</strong></div>
            <div><span>Known won value</span><strong>{formatAmountFull(customer.commercial.knownWonValue, "INR")}</strong></div>
            <div><span>Known Deal values</span><strong>{formatNumber(customer.commercial.knownDealValueRecords)}</strong></div>
            <div><span>Unknown Deal values</span><strong>{formatNumber(customer.commercial.unknownDealValueRecords)}</strong></div>
          </div>
          <div className="customer-subsection">
            <h3>Deal stages</h3>
            <div className="compact-list">
              {customer.commercial.dealStages.map((stage) => (
                <div key={stage.stage}>
                  <div><strong>{stage.stage}</strong><span>{formatNumber(stage.dealCount)} deals · {formatNumber(stage.unknownValueDeals)} unknown values</span></div>
                  <div className="compact-value"><strong>{formatAmountFull(stage.knownValue, "INR")}</strong></div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Cash" description="Work Order value, billing, collections and receivables.">
          <div className="summary-list">
            <div><span>Known WO value incl. GST</span><strong>{formatAmountFull(customer.cash.knownWorkOrderValueInclGst, "INR")}</strong></div>
            <div><span>Billed incl. GST</span><strong>{formatAmountFull(customer.cash.billedValueInclGst, "INR")}</strong></div>
            <div><span>Collected incl. GST</span><strong>{formatAmountFull(customer.cash.collectedAmountInclGst, "INR")}</strong></div>
            <div><span>Receivables</span><strong>{formatAmountFull(customer.cash.receivables, "INR")}</strong></div>
            <div><span>To be billed incl. GST</span><strong>{formatAmountFull(customer.cash.amountToBeBilledInclGst, "INR")}</strong></div>
            <div><span>AR priority Work Orders</span><strong>{formatNumber(customer.cash.arPriorityWorkOrders)}</strong></div>
          </div>
        </Panel>
      </div>

      <Panel title="Operations" description="Current project execution posture and timeline evidence.">
        {customer.operations.workOrders.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Work Order</th><th>Status</th><th>Timeline</th><th>Value incl. GST</th><th>Receivables</th></tr></thead>
              <tbody>
                {customer.operations.workOrders.map((workOrder) => (
                  <tr key={workOrder.mondayItemId}>
                    <td><strong>{workOrder.name}</strong><small>{workOrder.mondayItemId}</small></td>
                    <td>{workOrder.executionStatus ?? "Unknown"}</td>
                    <td><strong>{workOrder.probableStartDate ?? "—"} → {workOrder.probableEndDate ?? "—"}</strong><small>{workOrder.lastExecutedMonth ?? "No execution month"}</small></td>
                    <td>{formatAmountFull(workOrder.amountInclGst, "INR")}</td>
                    <td>{formatAmountFull(workOrder.amountReceivable, "INR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted-copy">No Work Orders are mapped to this canonical customer key.</p>}
      </Panel>

      <Panel title="Deal history" description="All current-snapshot Deals for the exact normalized customer key.">
        {customer.commercial.allDeals.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Deal</th><th>Status</th><th>Stage</th><th>Value</th><th>Close timing</th></tr></thead>
              <tbody>
                {customer.commercial.allDeals.map((deal) => (
                  <tr key={deal.mondayItemId}>
                    <td><strong>{deal.name}</strong><small>{deal.mondayItemId}</small></td>
                    <td>{deal.status ?? "Unknown"}</td>
                    <td>{deal.stage ?? "Unknown"}</td>
                    <td>{formatAmountFull(deal.value, "INR")}</td>
                    <td>{deal.tentativeCloseDate ?? deal.closeDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted-copy">No Deals are mapped to this canonical customer key.</p>}
      </Panel>

      <div className="split-grid">
        <Panel title="Trust & join evidence" description="Why these records belong to this Customer 360 view.">
          <div className="summary-list">
            <div><span>Deal evidence IDs</span><strong>{formatNumber(customer.trust.joinEvidence.dealItemIds.length)}</strong></div>
            <div><span>Work Order evidence IDs</span><strong>{formatNumber(customer.trust.joinEvidence.workOrderItemIds.length)}</strong></div>
            <div><span>Data-quality issues</span><strong>{formatNumber(customer.trust.dataQualityIssues.length)}</strong></div>
          </div>
          <details className="change-evidence customer-evidence"><summary>Exact evidence IDs</summary><div><p><strong>Deals:</strong> {customer.trust.joinEvidence.dealItemIds.join(", ") || "None"}</p><p><strong>Work Orders:</strong> {customer.trust.joinEvidence.workOrderItemIds.join(", ") || "None"}</p></div></details>
          <div className="attention-feed-caveats">
            {customer.trust.caveats.map((caveat) => <p key={caveat}>{caveat}</p>)}
          </div>
        </Panel>

        <Panel title="Attention" description="Active deterministic Founder Attention and Change Detective signals.">
          <div className="customer-attention-list">
            {customer.attention.founderAttentionItems.map((item) => (
              <div className="customer-attention-row" key={`${item.title}-${item.entity}`}>
                <StatusPill tone={item.severity === "HIGH" ? "critical" : "warning"}>{item.severity}</StatusPill>
                <div><strong>{item.title}</strong><p>{item.reason}</p></div>
              </div>
            ))}
            {customer.attention.changeSignals.map((signal) => (
              <div className="customer-attention-row" key={signal.id}>
                <StatusPill tone="info">Change</StatusPill>
                <div><strong>{signal.title}</strong><p>{signal.whatChanged}</p></div>
              </div>
            ))}
            {customer.attention.founderAttentionItems.length === 0 && customer.attention.changeSignals.length === 0 ? (
              <p className="muted-copy">No active deterministic attention or historical change signals for this customer.</p>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel title="History" description="Customer metrics over persisted snapshots when history exists.">
        {customer.history.length > 1 ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Snapshot</th><th>Open / won deals</th><th>Known pipeline</th><th>Active / delayed WOs</th><th>Receivables</th></tr></thead>
              <tbody>
                {customer.history.map((point) => (
                  <tr key={point.snapshotId}>
                    <td><strong>{formatDateTime(point.capturedAt)}</strong><small>{point.snapshotId}</small></td>
                    <td>{formatNumber(point.openDeals)} / {formatNumber(point.wonDeals)}</td>
                    <td>{formatAmountFull(point.knownOpenPipelineValue, "INR")}</td>
                    <td>{formatNumber(point.activeWorkOrders)} / {formatNumber(point.delayedWorkOrders)}</td>
                    <td>{formatAmountFull(point.receivables, "INR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted-copy">Only one distinct snapshot is currently available. Historical Customer 360 trends will appear when Agent 1 snapshot history is wired.</p>}
      </Panel>
    </div>
  );
}
