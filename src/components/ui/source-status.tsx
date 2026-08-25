import { formatDateTime, formatNumber } from "./formatters";

type SourceStatusProps = {
  provider?: string;
  fetchedAt?: string;
  boardNames?: string[];
  boardIds?: string[];
  recordsAnalyzed?: number;
};

export function SourceStatus({
  provider = "monday.com",
  fetchedAt,
  boardNames = [],
  boardIds = [],
  recordsAnalyzed,
}: SourceStatusProps) {
  const boards = boardNames.length ? boardNames : boardIds;
  const boardLabel = boards.length
    ? boards.join(" · ")
    : "Source boards available at runtime";

  return (
    <div className="source-status" title={boardLabel}>
      <span className="source-status-dot" aria-hidden="true" />
      <div>
        <strong>Live {provider}</strong>
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
