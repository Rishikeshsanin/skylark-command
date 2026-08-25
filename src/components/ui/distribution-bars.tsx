import { formatNumber } from "./formatters";

type DistributionBarsProps = {
  items: Array<{ label: string; value: number; secondary?: string; detail?: string }>;
  emptyLabel?: string;
  ariaLabel?: string;
};

export function DistributionBars({
  items,
  emptyLabel = "No distribution data available.",
  ariaLabel = "Data distribution",
}: DistributionBarsProps) {
  if (!items.length) return <p className="muted-copy">{emptyLabel}</p>;
  const maximum = Math.max(...items.map((item) => item.value), 0);

  return (
    <div className="distribution-list" role="list" aria-label={ariaLabel}>
      {items.map((item) => {
        const width = maximum > 0 ? Math.max((item.value / maximum) * 100, 2) : 0;
        return (
          <div
            className="distribution-row"
            key={item.label}
            role="listitem"
            aria-label={`${item.label}: ${item.detail ?? item.secondary ?? formatNumber(item.value)}`}
          >
            <div className="distribution-meta">
              <span>{item.label}</span>
              <span className="tabular" title={item.detail}>{item.secondary ?? formatNumber(item.value)}</span>
            </div>
            <div className="distribution-track" aria-hidden="true">
              <span className="distribution-fill" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
