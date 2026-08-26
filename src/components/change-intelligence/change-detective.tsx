import Link from "next/link";
import type { ChangeIntelligenceResult, ChangeMetricValue, ChangeSignal } from "@/types";
import { formatAmountFull, formatDateTime, formatNumber } from "@/components/ui/formatters";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";

function formatSignalValue(signal: ChangeSignal, value: ChangeMetricValue) {
  if (value === null) return "Unavailable";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  if (/value|pipeline|receivable|exposure|amount/i.test(signal.metric)) {
    return formatAmountFull(value, "INR");
  }
  if (/sharepct/i.test(signal.metric)) return `${formatNumber(value, 2)}%`;
  return formatNumber(value, 2);
}

function signalTone(signal: ChangeSignal): "neutral" | "positive" | "warning" | "critical" | "info" {
  if (signal.direction === "deteriorated") return "critical";
  if (["deal_newly_lost", "deal_newly_stale", "work_order_newly_delayed", "work_order_newly_paused"].includes(signal.type)) {
    return "warning";
  }
  if (signal.type === "deal_newly_won") return "positive";
  return "info";
}

function directionLabel(signal: ChangeSignal) {
  return signal.direction === "deteriorated" ? "Deterioration" : signal.direction;
}

export function ChangeDetective({ result }: { result: ChangeIntelligenceResult }) {
  if (result.uniqueSnapshotCount < 2) {
    return (
      <div className="dashboard-stack">
        <div className="state-card">
          <span className="state-icon" aria-hidden="true">Δ</span>
          <p className="state-title">Historical comparison not available yet</p>
          <p className="state-description">
            Change Detective needs at least two distinct persisted snapshots. The current live snapshot is available, but Skylark does not fabricate a historical baseline.
          </p>
        </div>
        <Panel title="Method contract" description="What will happen as soon as Agent 1 snapshot history is wired">
          <div className="summary-list">
            <div><span>Aggregate shifts</span><strong>Delta + % + median/MAD baseline</strong></div>
            <div><span>Large new opportunities</span><strong>Prior P90 with IQR evidence</strong></div>
            <div><span>Record transitions</span><strong>Exact monday item ID comparison</strong></div>
            <div><span>Predictive ML</span><strong>None</strong></div>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="dashboard-stack change-detective-layout">
      <div className="metric-grid metric-grid-four">
        <article className="metric-card">
          <p className="metric-label">Material changes</p>
          <p className="metric-value">{formatNumber(result.signals.length)}</p>
          <p className="metric-hint">Deterministic/statistical signals</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Distinct snapshots</p>
          <p className="metric-value">{formatNumber(result.uniqueSnapshotCount)}</p>
          <p className="metric-hint">{result.snapshotCount - result.uniqueSnapshotCount} duplicate references ignored</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Window start</p>
          <p className="metric-value change-date-value">{formatDateTime(result.timeWindow.from)}</p>
          <p className="metric-hint">Snapshot {result.fromSnapshotId}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Window end</p>
          <p className="metric-value change-date-value">{formatDateTime(result.timeWindow.to)}</p>
          <p className="metric-hint">Snapshot {result.toSnapshotId}</p>
        </article>
      </div>

      <Panel title="Change Detective" description="What changed, why it matters, and the exact source evidence behind it.">
        {result.signals.length ? (
          <div className="change-feed">
            {result.signals.map((signal) => (
              <article className="change-signal" key={signal.id}>
                <div className="change-signal-heading">
                  <div>
                    <StatusPill tone={signalTone(signal)}>{directionLabel(signal)}</StatusPill>
                    <h3>{signal.title}</h3>
                    <p>{signal.whatChanged}</p>
                  </div>
                  {signal.affected.customer ? (
                    <Link className="customer-link" href={`/customers/${encodeURIComponent(signal.affected.customer)}`}>
                      {signal.affected.customer} →
                    </Link>
                  ) : signal.affected.sector ? (
                    <span className="change-entity-chip">{signal.affected.sector}</span>
                  ) : null}
                </div>

                <div className="change-value-grid">
                  <div><span>Old</span><strong>{formatSignalValue(signal, signal.oldValue)}</strong></div>
                  <div><span>New</span><strong>{formatSignalValue(signal, signal.newValue)}</strong></div>
                  <div><span>Delta</span><strong>{signal.delta === null ? "—" : formatSignalValue(signal, signal.delta)}</strong></div>
                  <div><span>% delta</span><strong>{signal.percentageDelta === null ? "—" : `${formatNumber(signal.percentageDelta, 2)}%`}</strong></div>
                </div>

                <div className="change-explanation-grid">
                  <div>
                    <span>Method</span>
                    <strong>{signal.method.name.replaceAll("_", " ")}</strong>
                    <p>{signal.method.description}</p>
                  </div>
                  <div>
                    <span>Completeness</span>
                    <strong>{formatNumber(signal.dataCompleteness.knownRecords)} known · {formatNumber(signal.dataCompleteness.unknownRecords)} unknown</strong>
                    <p>{signal.dataCompleteness.note}</p>
                  </div>
                </div>

                <details className="change-evidence">
                  <summary>Evidence records</summary>
                  <div>
                    <p><strong>Deals:</strong> {signal.evidence.dealItemIds.join(", ") || "None"}</p>
                    <p><strong>Work Orders:</strong> {signal.evidence.workOrderItemIds.join(", ") || "None"}</p>
                    <p><strong>Snapshots:</strong> {signal.sourceSnapshotIds.from} → {signal.sourceSnapshotIds.to}</p>
                  </div>
                </details>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No material deterministic changes were detected between the latest two distinct snapshots.</p>
        )}
      </Panel>

      <Panel title="Caveats" description="Interpretation constraints remain part of the result contract.">
        <div className="compact-list">
          {result.caveats.map((caveat) => <div key={caveat}><span>{caveat}</span></div>)}
        </div>
      </Panel>
    </div>
  );
}
