import { ChartEmptyState } from "./chart-empty-state";

type WaterfallChartProps = {
  ariaLabel: string;
  oldLabel?: string;
  currentLabel?: string;
  oldValue: number;
  newValue: number;
  delta: number;
  formattedOld: string;
  formattedNew: string;
  formattedDelta: string;
};

const PLOT_TOP = 18;
const PLOT_BOTTOM = 154;

export function WaterfallChart({
  ariaLabel,
  oldLabel = "Previous",
  currentLabel = "Current",
  oldValue,
  newValue,
  delta,
  formattedOld,
  formattedNew,
  formattedDelta,
}: WaterfallChartProps) {
  if (![oldValue, newValue, delta].every(Number.isFinite)) {
    return <ChartEmptyState description="The supplied comparison does not contain three finite numeric values." />;
  }

  const domainMinimum = Math.min(0, oldValue, newValue);
  const domainMaximum = Math.max(0, oldValue, newValue);
  const domainRange = domainMaximum - domainMinimum || 1;
  const y = (value: number) =>
    PLOT_BOTTOM - ((value - domainMinimum) / domainRange) * (PLOT_BOTTOM - PLOT_TOP);
  const zeroY = y(0);
  const oldY = y(oldValue);
  const newY = y(newValue);
  const oldHeight = Math.max(Math.abs(zeroY - oldY), 2);
  const newHeight = Math.max(Math.abs(zeroY - newY), 2);
  const deltaHeight = Math.max(Math.abs(oldY - newY), 2);
  const deltaTone = delta >= 0 ? "positive" : "critical";

  return (
    <figure className="waterfall-chart">
      <svg viewBox="0 0 600 205" role="img" aria-label={ariaLabel}>
        <title>{`${ariaLabel}. ${oldLabel}: ${formattedOld}. Change: ${formattedDelta}. ${currentLabel}: ${formattedNew}.`}</title>
        <line className="waterfall-axis" x1="32" x2="568" y1={zeroY} y2={zeroY} />
        <line className="waterfall-connector waterfall-step-one" x1="164" x2="252" y1={oldY} y2={oldY} />
        <line className="waterfall-connector waterfall-step-two" x1="348" x2="436" y1={newY} y2={newY} />
        <g className="waterfall-step waterfall-step-one" tabIndex={0} aria-label={`${oldLabel}: ${formattedOld}`}>
          <rect className="waterfall-bar waterfall-neutral" x="76" y={Math.min(zeroY, oldY)} width="88" height={oldHeight} rx="6" />
          <title>{`${oldLabel}: ${formattedOld}`}</title>
        </g>
        <g className="waterfall-step waterfall-step-two" tabIndex={0} aria-label={`Change: ${formattedDelta}`}>
          <rect className={`waterfall-bar waterfall-${deltaTone}`} x="252" y={Math.min(oldY, newY)} width="96" height={deltaHeight} rx="6" />
          <title>{`Change: ${formattedDelta}`}</title>
        </g>
        <g className="waterfall-step waterfall-step-three" tabIndex={0} aria-label={`${currentLabel}: ${formattedNew}`}>
          <rect className="waterfall-bar waterfall-info" x="436" y={Math.min(zeroY, newY)} width="88" height={newHeight} rx="6" />
          <title>{`${currentLabel}: ${formattedNew}`}</title>
        </g>
        <text className="waterfall-label" x="120" y="190">{oldLabel}</text>
        <text className="waterfall-label" x="300" y="190">Change</text>
        <text className="waterfall-label" x="480" y="190">{currentLabel}</text>
      </svg>
      <figcaption className="waterfall-values">
        <span><small>{oldLabel}</small><strong>{formattedOld}</strong></span>
        <span className={`waterfall-value-${deltaTone}`}><small>Change</small><strong>{formattedDelta}</strong></span>
        <span><small>{currentLabel}</small><strong>{formattedNew}</strong></span>
      </figcaption>
    </figure>
  );
}
