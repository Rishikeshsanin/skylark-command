type ChartEmptyStateProps = {
  title?: string;
  description: string;
};

export function ChartEmptyState({
  title = "Visualization unavailable",
  description,
}: ChartEmptyStateProps) {
  return (
    <div className="chart-empty-state" role="note" aria-label={`${title}. ${description}`}>
      <span aria-hidden="true">↗</span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}
