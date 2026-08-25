import { formatNumber } from "./formatters";

type DistributionBarsProps = {
  items: Array<{ label: string; value: number; secondary?: string }>;
  emptyLabel?: string;
};

export function DistributionBars({ items, emptyLabel = "No distribution data available." }: DistributionBarsProps) {
  if (!items.length) return <p className="muted-copy">{emptyLabel}</p>;
  const maximum = Math.max(...items.map((item) => item.value), 0);

  return (
    <div className="distribution-list">
      {items.map((item) => {
        const width = maximum > 0 ? Math.max((item.value / maximum) * 100, 2) : 0;
        return (
          <div className="distribution-row" key={item.label}>
            <div className="distribution-meta">
              <span>{item.label}</span>
              <span className="tabular">{item.secondary ?? formatNumber(item.value)}</span>
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
