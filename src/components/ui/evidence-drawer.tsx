import type { ReactNode } from "react";
import { InsightBadge, type InsightKind } from "./insight-badge";

type EvidenceDrawerProps = {
  children: ReactNode;
  summary?: string;
  kind?: InsightKind;
  defaultOpen?: boolean;
};

export function EvidenceDrawer({
  children,
  summary = "Why should I trust this?",
  kind = "fact",
  defaultOpen = false,
}: EvidenceDrawerProps) {
  return (
    <details className="evidence-drawer" open={defaultOpen}>
      <summary>{summary}</summary>
      <div className="evidence-drawer-body">
        <div className="evidence-drawer-meta">
          <InsightBadge kind={kind} />
        </div>
        {children}
      </div>
    </details>
  );
}
