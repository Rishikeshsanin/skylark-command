import { ChartEmptyState } from "./chart-empty-state";

export type DonutTone = "neutral" | "positive" | "warning" | "critical" | "info";

export type DonutItem = {
  label: string;
  value: number;
  formattedValue: string;
  tone?: DonutTone;
};

type DistributionDonutProps = {
  ariaLabel: string;
  items: DonutItem[];
  centerLabel: string;
  centerValue: string;
  emptyDescription?: string;
};

export function DistributionDonut({
  ariaLabel,
  items,
  centerLabel,
  centerValue,
  emptyDescription = "No supplied category values are available for this distribution.",
}: DistributionDonutProps) {
  const normalizedItems = items.map((item) => ({ ...item, value: Math.max(item.value, 0) }));
  const total = normalizedItems.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) {
    return <ChartEmptyState title="No distribution to plot" description={emptyDescription} />;
  }

  const chartSegments = normalizedItems.map((item, index) => ({
    item,
    share: (item.value / total) * 100,
    offset: normalizedItems
      .slice(0, index)
      .reduce((sum, previous) => sum + (previous.value / total) * 100, 0),
  }));

  return (
    <figure className="donut-chart">
      <div className="donut-plot">
        <svg viewBox="0 0 120 120" role="img" aria-label={ariaLabel}>
          <title>{ariaLabel}</title>
          <circle className="donut-track" cx="60" cy="60" r="46" pathLength="100" />
          {chartSegments.map(({ item, share, offset }) => {
            return item.value > 0 ? (
              <circle
                className={`donut-segment donut-${item.tone ?? "neutral"}`}
                cx="60"
                cy="60"
                r="46"
                pathLength="100"
                strokeDasharray={`${share} ${100 - share}`}
                strokeDashoffset={-offset}
                key={item.label}
                aria-label={`${item.label}: ${item.formattedValue}`}
              >
                <title>{`${item.label}: ${item.formattedValue}`}</title>
              </circle>
            ) : null;
          })}
        </svg>
        <div className="donut-center" aria-hidden="true">
          <strong>{centerValue}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <figcaption className="donut-legend">
        {normalizedItems.map((item) => (
          <span key={item.label}>
            <i className={`donut-legend-dot donut-${item.tone ?? "neutral"}`} aria-hidden="true" />
            <span>{item.label}</span>
            <strong>{item.formattedValue}</strong>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
