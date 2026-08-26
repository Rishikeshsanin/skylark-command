import { formatDateTime, formatNumber } from "./formatters";
import { FreshnessIndicator, type FreshnessState } from "./freshness-indicator";

type PlatformFreshnessState = "fresh" | "stale" | "syncing" | "failed";

type SourceStatusProps = {
  provider?: string;
  fetchedAt?: string;
  boardNames?: string[];
  boardIds?: string[];
  recordsAnalyzed?: number;
  dataMode?: "live" | "temporal";
  freshnessState?: PlatformFreshnessState;
  lastSyncSucceededAt?: string | null;
};

function freshnessPresentation(input: {
  fetchedAt?: string;
  dataMode?: "live" | "temporal";
  freshnessState?: PlatformFreshnessState;
}): { state: FreshnessState; label: string } {
  if (input.dataMode === "temporal") {
    switch (input.freshnessState) {
      case "fresh":
        return { state: "recent", label: "Fresh snapshot" };
      case "stale":
        return { state: "stale", label: "Stale snapshot" };
      case "syncing":
        return { state: "recent", label: "Syncing" };
      case "failed":
        return { state: "stale", label: "Last sync failed" };
      default:
        return { state: "unknown", label: "Snapshot freshness unknown" };
    }
  }
  return input.fetchedAt
    ? { state: "live", label: "Live" }
    : { state: "unknown", label: "Connected" };
}

export function SourceStatus({
  provider = "monday.com",
  fetchedAt,
  boardNames = [],
  boardIds = [],
  recordsAnalyzed,
  dataMode = "live",
  freshnessState,
  lastSyncSucceededAt,
}: SourceStatusProps) {
  const boards = boardNames.length ? boardNames : boardIds;
  const boardLabel = boards.length
    ? boards.join(" · ")
    : "Source boards available at runtime";
  const freshness = freshnessPresentation({ fetchedAt, dataMode, freshnessState });
  const freshnessDetail = dataMode === "temporal" && lastSyncSucceededAt
    ? `Last sync ${formatDateTime(lastSyncSucceededAt)}`
    : undefined;

  return (
    <div className="source-status" title={boardLabel}>
      <div>
        <div className="source-status-heading">
          <FreshnessIndicator
            state={freshness.state}
            label={freshness.label}
            detail={freshnessDetail}
          />
          <span>{provider}</span>
        </div>
        <span>
          {recordsAnalyzed !== undefined
            ? `${formatNumber(recordsAnalyzed)} records analyzed`
            : fetchedAt
              ? "Source refreshed"
              : "Source connected"}
        </span>
        <small>{fetchedAt ? `Fetched ${formatDateTime(fetchedAt)}` : boardLabel}</small>
      </div>
    </div>
  );
}
