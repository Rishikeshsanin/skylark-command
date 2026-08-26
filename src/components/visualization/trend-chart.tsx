import { ChartEmptyState } from "./chart-empty-state";

export type TrendTone = "neutral" | "positive" | "warning" | "critical" | "info";

export type TrendDatum = {
  value: number | null;
  formattedValue: string;
};

export type TrendSeries = {
  label: string;
  tone?: TrendTone;
  values: TrendDatum[];
};

type TrendChartProps = {
  ariaLabel: string;
  labels: string[];
  series: TrendSeries[];
  caption?: string;
  emptyDescription?: string;
};

const VIEWBOX_WIDTH = 720;
const VIEWBOX_HEIGHT = 250;
const PLOT_LEFT = 42;
const PLOT_RIGHT = 690;
const PLOT_TOP = 28;
const PLOT_BOTTOM = 196;

function pathForValues(
  values: TrendDatum[],
  pointX: (index: number) => number,
  pointY: (value: number) => number,
) {
  let path = "";
  let drawing = false;
  values.forEach((datum, index) => {
    if (datum.value === null || !Number.isFinite(datum.value)) {
      drawing = false;
      return;
    }
    path += `${drawing ? "L" : "M"}${pointX(index).toFixed(2)},${pointY(datum.value).toFixed(2)} `;
    drawing = true;
  });
  return path.trim();
}

export function TrendChart({
  ariaLabel,
  labels,
  series,
  caption,
  emptyDescription = "At least two canonical historical points are required before a trend is shown.",
}: TrendChartProps) {
  const numericValues = series.flatMap((item) =>
    item.values.flatMap((datum) =>
      datum.value !== null && Number.isFinite(datum.value) ? [datum.value] : [],
    ),
  );

  if (labels.length < 2 || numericValues.length < 2 || series.length === 0) {
    return <ChartEmptyState title="Historical trend not available" description={emptyDescription} />;
  }

  const domainMinimum = Math.min(0, ...numericValues);
  const domainMaximum = Math.max(0, ...numericValues);
  const domainRange = domainMaximum - domainMinimum || 1;
  const pointX = (index: number) =>
    PLOT_LEFT + (index / Math.max(labels.length - 1, 1)) * (PLOT_RIGHT - PLOT_LEFT);
  const pointY = (value: number) =>
    PLOT_BOTTOM - ((value - domainMinimum) / domainRange) * (PLOT_BOTTOM - PLOT_TOP);
  const textualSummary = series
    .map((item) => `${item.label}: ${item.values.map((value, index) => `${labels[index] ?? `Point ${index + 1}`} ${value.formattedValue}`).join(", ")}`)
    .join(". ");

  return (
    <figure className="trend-chart">
      <div className="trend-plot">
        <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} role="img" aria-label={ariaLabel}>
          <title>{ariaLabel}</title>
          <desc>{textualSummary}</desc>
          {[0, 1, 2, 3].map((line) => {
            const y = PLOT_TOP + (line / 3) * (PLOT_BOTTOM - PLOT_TOP);
            return <line className="trend-gridline" x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y} y2={y} key={line} />;
          })}
          <line className="trend-axis" x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} />
          {series.map((item) => (
            <g className={`trend-series trend-${item.tone ?? "neutral"}`} key={item.label}>
              <path className="trend-line" d={pathForValues(item.values, pointX, pointY)} pathLength="1" />
              {item.values.map((datum, index) =>
                datum.value !== null && Number.isFinite(datum.value) ? (
                  <circle
                    className="trend-point"
                    cx={pointX(index)}
                    cy={pointY(datum.value)}
                    r="5"
                    tabIndex={0}
                    aria-label={`${item.label}, ${labels[index] ?? `Point ${index + 1}`}: ${datum.formattedValue}`}
                    key={`${item.label}-${labels[index] ?? index}`}
                  >
                    <title>{`${item.label} · ${labels[index] ?? `Point ${index + 1}`} · ${datum.formattedValue}`}</title>
                  </circle>
                ) : null,
              )}
            </g>
          ))}
          <text className="trend-axis-label" x={PLOT_LEFT} y="228">{labels[0]}</text>
          <text className="trend-axis-label trend-axis-label-end" x={PLOT_RIGHT} y="228">{labels.at(-1)}</text>
        </svg>
      </div>
      <figcaption>
        <div className="trend-legend">
          {series.map((item) => (
            <span key={item.label}>
              <i className={`trend-legend-line trend-${item.tone ?? "neutral"}`} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
        {caption && <p>{caption}</p>}
      </figcaption>
    </figure>
  );
}
