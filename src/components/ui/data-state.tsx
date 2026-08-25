"use client";

type DataStateProps = {
  state: "loading" | "empty" | "error";
  title?: string;
  description?: string;
  onRetryLabel?: string;
};

export function DataState({ state, title, description, onRetryLabel = "Retry" }: DataStateProps) {
  if (state === "loading") {
    return (
      <div className="state-card" role="status" aria-live="polite">
        <span className="state-icon state-icon-loading" aria-hidden="true" />
        <div>
          <p className="state-title">{title ?? "Loading live intelligence"}</p>
          <p className="state-description">{description ?? "Preparing the latest view from connected data sources."}</p>
        </div>
        <div className="skeleton-stack" aria-hidden="true">
          <span className="skeleton-line skeleton-line-wide" />
          <span className="skeleton-line" />
          <span className="skeleton-line skeleton-line-short" />
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="state-card" role="alert">
        <span className="state-icon state-icon-error" aria-hidden="true">!</span>
        <div>
          <p className="state-title">{title ?? "Unable to load this view"}</p>
          <p className="state-description">{description ?? "The data service did not return a usable response. No values have been inferred."}</p>
        </div>
        <button className="button button-secondary" type="button" onClick={() => window.location.reload()}>{onRetryLabel}</button>
      </div>
    );
  }

  return (
    <div className="state-card" role="status">
      <span className="state-icon" aria-hidden="true">—</span>
      <div>
        <p className="state-title">{title ?? "Waiting for live data"}</p>
        <p className="state-description">{description ?? "This screen is connected to canonical BI contracts and will populate when its backend endpoint is available."}</p>
      </div>
    </div>
  );
}
