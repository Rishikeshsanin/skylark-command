import { formatDateTime } from "./formatters";

type SourceStatusProps = { provider?: string; fetchedAt?: string; boardNames?: string[] };
export function SourceStatus({ provider = "monday.com", fetchedAt, boardNames = [] }: SourceStatusProps) {
  return <div className="source-status" title={boardNames.join(" · ") || undefined}><span className="source-status-dot" aria-hidden="true" /><div><strong>Live {provider}</strong><span>{fetchedAt ? `Updated ${formatDateTime(fetchedAt)}` : "Source connected"}</span></div></div>;
}
