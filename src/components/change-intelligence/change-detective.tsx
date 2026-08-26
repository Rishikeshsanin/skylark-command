import Link from "next/link";
import type { ChangeIntelligenceResult, ChangeMetricValue, ChangeSignal } from "@/types";
import { formatAmountFull, formatDateTime, formatNumber } from "@/components/ui/formatters";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { WaterfallChart } from "@/components/visualization/waterfall-chart";

const readinessCapabilities = [
  {
    icon: "↗",
    title: "Pipeline movement",
    description: "Open pipeline shifts with absolute and percentage deltas.",
  },
  {
    icon: "◎",
    title: "Sector shifts",
    description: "Concentration changes surfaced against the prior real observation.",
  },
  {
    icon: "₹",
    title: "Cash movement",
    description: "Receivables, billing and collections movement with known-value coverage.",
  },
  {
    icon: "⇄",
    title: "Record transitions",
    description: "Exact monday item transitions such as won, lost, delayed or paused.",
  },
  {
    icon: "◇",
    title: "Large opportunities",
    description: "New high-value opportunities evaluated against robust prior distributions.",
  },
  {
    icon: "✓",
    title: "Evidence trail",
    description: "Every signal links back to deterministic source records and snapshot IDs.",
  },
] as const;

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
    const observationCount = result.uniqueSnapshotCount;
    const hasBaseline = observationCount > 0;

    return (
      <div className="dashboard-stack change-readiness-layout">
        <section className="change-readiness-hero" aria-labelledby="change-readiness-title">
          <div className="change-readiness-copy">
            <div className="change-readiness-status">
              <span className={hasBaseline ? "change-readiness-dot is-ready" : "change-readiness-dot"} aria-hidden="true" />
              {hasBaseline ? "Baseline captured" : "Baseline preparation"}
            </div>
            <h2 id="change-readiness-title">
              {hasBaseline
                ? "Change Detective is armed for the next real observation."
                : "Change Detective is ready to establish its first real baseline."}
            </h2>
            <p>
              {hasBaseline
                ? "Skylark has a real source-backed baseline. The next distinct snapshot unlocks before-vs-after intelligence across pipeline, cash, delivery and record transitions — without inventing historical data."
                : "Once the first source-backed snapshot is captured, Skylark will preserve it as the comparison baseline. No historical values are manufactured to make this screen look complete."}
            </p>
            <div className="change-readiness-actions" aria-label="Change Detective shortcuts">
              <Link className="button button-primary" href="/data-health">View Data Health</Link>
              <Link className="button button-secondary" href="/copilot">Open Founder Copilot</Link>
              <Link className="change-readiness-link" href="/">Back to Overview →</Link>
            </div>
          </div>

          <div className="change-readiness-orbit" aria-hidden="true">
            <span className="change-orbit-ring change-orbit-ring-outer" />
            <span className="change-orbit-ring change-orbit-ring-inner" />
            <span className="change-orbit-node change-orbit-node-a" />
            <span className="change-orbit-node change-orbit-node-b" />
            <span className="change-orbit-core">Δ</span>
            <span className="change-orbit-label">CHANGE ENGINE</span>
          </div>
        </section>

        <div className="metric-grid metric-grid-four change-readiness-metrics">
          <article className="metric-card metric-card-positive">
            <p className="metric-label">Real observations</p>
            <p className="metric-value">{formatNumber(observationCount)} / 2</p>
            <p className="metric-hint">Two distinct observations unlock comparison</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Baseline</p>
            <p className="metric-value change-readiness-word">{hasBaseline ? "Captured" : "Waiting"}</p>
            <p className="metric-hint">Source-backed; never synthesized</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Decision method</p>
            <p className="metric-value change-readiness-word">Deterministic</p>
            <p className="metric-hint">Exact deltas + robust statistics</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Predictive ML</p>
            <p className="metric-value change-readiness-word">None</p>
            <p className="metric-hint">No opaque score is shown as fact</p>
          </article>
        </div>

        <section className="change-progress-card" aria-label="Change comparison readiness">
          <div className="change-progress-heading">
            <div>
              <span className="change-section-kicker">Comparison readiness</span>
              <h3>{hasBaseline ? "One more distinct observation to unlock signals" : "Capture the first real observation"}</h3>
            </div>
            <strong>{formatNumber(Math.min(observationCount, 2))}/2 observations</strong>
          </div>
          <div className="change-progress-track" aria-hidden="true">
            <span style={{ width: hasBaseline ? "50%" : "10%" }} />
          </div>
          <div className="change-progress-steps">
            <div className="change-progress-step is-complete">
              <span>01</span>
              <strong>Live source</strong>
              <p>monday data is the source of record.</p>
            </div>
            <div className={`change-progress-step ${hasBaseline ? "is-complete" : "is-active"}`}>
              <span>02</span>
              <strong>Baseline</strong>
              <p>{hasBaseline ? "A real observation is preserved." : "Waiting for the first persisted observation."}</p>
            </div>
            <div className={`change-progress-step ${hasBaseline ? "is-active" : ""}`}>
              <span>03</span>
              <strong>Next observation</strong>
              <p>Only a genuinely changed source state advances history.</p>
            </div>
            <div className="change-progress-step">
              <span>04</span>
              <strong>Signals</strong>
              <p>Evidence-backed deltas and transitions become available.</p>
            </div>
          </div>
        </section>

        <Panel title="What unlocks next" description="The comparison engine is already defined; these views appear as soon as a second real observation exists.">
          <div className="change-capability-grid">
            {readinessCapabilities.map((capability) => (
              <article className="change-capability-card" key={capability.title}>
                <span className="change-capability-icon" aria-hidden="true">{capability.icon}</span>
                <div>
                  <strong>{capability.title}</strong>
                  <p>{capability.description}</p>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="How comparisons are calculated" description="Trust rules stay visible before the first delta is ever shown.">
          <div className="change-method-grid">
            <div className="summary-list">
              <div><span>Aggregate shifts</span><strong>Delta + % + median/MAD baseline</strong></div>
              <div><span>Large new opportunities</span><strong>Prior P90 with IQR evidence</strong></div>
              <div><span>Record transitions</span><strong>Exact monday item ID comparison</strong></div>
              <div><span>Historical baseline</span><strong>Persisted real observations only</strong></div>
            </div>
            <div className="change-trust-callout">
              <span className="change-trust-icon" aria-hidden="true">✓</span>
              <div>
                <strong>No fabricated history</strong>
                <p>
                  Missing history remains missing. Skylark waits for another real observation instead of backfilling a convincing-looking number.
                </p>
              </div>
            </div>
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
          <p className="metric-label">Comparison points</p>
          <p className="metric-value">{formatNumber(result.uniqueSnapshotCount)}</p>
          <p className="metric-hint">Persisted history plus current source observations</p>
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

                {typeof signal.oldValue === "number" && typeof signal.newValue === "number" && signal.delta !== null ? (
                  <div className="change-waterfall-frame">
                    <WaterfallChart
                      ariaLabel={`${signal.title}: supplied ${signal.metric} movement from previous snapshot to current snapshot`}
                      oldValue={signal.oldValue}
                      newValue={signal.newValue}
                      delta={signal.delta}
                      formattedOld={formatSignalValue(signal, signal.oldValue)}
                      formattedNew={formatSignalValue(signal, signal.newValue)}
                      formattedDelta={formatSignalValue(signal, signal.delta)}
                    />
                  </div>
                ) : null}

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
          <p className="muted-copy">No material deterministic changes were detected between the latest two real comparison points.</p>
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
