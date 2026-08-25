import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "neutral" | "positive" | "warning" | "critical";
};

export function MetricCard({ label, value, hint, tone = "neutral" }: MetricCardProps) {
  return (
    <article className={`metric-card metric-card-${tone}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {hint && <p className="metric-hint">{hint}</p>}
    </article>
  );
}
