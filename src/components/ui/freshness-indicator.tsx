export type FreshnessState = "live" | "recent" | "stale" | "unknown";

const defaultLabels = {
  live: "Live",
  recent: "Recent",
  stale: "Stale",
  unknown: "Freshness unknown",
} satisfies Record<FreshnessState, string>;

type FreshnessIndicatorProps = {
  state: FreshnessState;
  label?: string;
  detail?: string;
};

export function FreshnessIndicator({
  state,
  label,
  detail,
}: FreshnessIndicatorProps) {
  return (
    <span className={`freshness-indicator freshness-${state}`}>
      <span className="freshness-dot" aria-hidden="true" />
      <span>{label ?? defaultLabels[state]}</span>
      {detail ? <small>{detail}</small> : null}
    </span>
  );
}
