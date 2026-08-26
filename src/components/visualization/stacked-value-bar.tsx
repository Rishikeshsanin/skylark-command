import { ChartEmptyState } from "./chart-empty-state";

export type StackedValueTone = "neutral" | "positive" | "warning" | "critical" | "info";

export type StackedValueSegment = {
  label: string;
  value: number;
  formattedValue: string;
  tone?: StackedValueTone;
};

type StackedValueBarProps = {
  ariaLabel: string;
  segments: StackedValueSegment[];
  totalLabel?: string;
  formattedTotal?: string;
  caption?: string;
  emptyDescription?: string;
};

export function StackedValueBar({
  ariaLabel,
  segments,
  totalLabel,
  formattedTotal,
  caption,
  emptyDescription = "No supplied values are available for this comparison.",
}: StackedValueBarProps) {
  const normalizedSegments = segments.map((segment) => ({
    ...segment,
    value: Math.max(segment.value, 0),
  }));
  const hasValue = normalizedSegments.some((segment) => segment.value > 0);

  if (!hasValue) {
    return <ChartEmptyState title="No composition to plot" description={emptyDescription} />;
  }

  const accessibleValues = normalizedSegments
    .map((segment) => `${segment.label}: ${segment.formattedValue}`)
    .join(", ");

  return (
    <figure className="stacked-value-chart" aria-label={`${ariaLabel}. ${accessibleValues}`}>
      {(totalLabel || formattedTotal) && (
        <div className="stacked-value-heading">
          <span>{totalLabel}</span>
          <strong>{formattedTotal}</strong>
        </div>
      )}
      <div className="stacked-value-track" aria-hidden="true">
        {normalizedSegments.map((segment) => (
          <span
            className={`stacked-value-segment stacked-${segment.tone ?? "neutral"}`}
            style={{ flexGrow: segment.value }}
            key={segment.label}
          />
        ))}
      </div>
      <figcaption>
        <div className="stacked-value-legend">
          {normalizedSegments.map((segment) => (
            <span key={segment.label}>
              <i className={`stacked-value-dot stacked-${segment.tone ?? "neutral"}`} aria-hidden="true" />
              <span>{segment.label}</span>
              <strong>{segment.formattedValue}</strong>
            </span>
          ))}
        </div>
        {caption && <p>{caption}</p>}
      </figcaption>
    </figure>
  );
}
