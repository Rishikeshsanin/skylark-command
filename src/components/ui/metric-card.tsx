import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  exactValue?: string;
  hint?: string;
  tone?: "neutral" | "positive" | "warning" | "critical";
};

export function MetricCard({ label, value, exactValue, hint, tone = "neutral" }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card-${tone}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value" title={exactValue}>{value}</p>
      {exactValue && <p className="metric-exact">Exact {exactValue}</p>}
      {hint && <p className="metric-hint">{hint}</p>}
    </article>
  );
}
