import type { ReactNode } from "react";

export type InsightKind = "fact" | "estimate" | "interpretation";

const defaultLabels: Record<InsightKind, string> = {
  fact: "Fact",
  estimate: "Estimate",
  interpretation: "Interpretation",
};

type InsightBadgeProps = {
  kind: InsightKind;
  children?: ReactNode;
};

export function InsightBadge({ kind, children }: InsightBadgeProps) {
  return (
    <span className={`insight-badge insight-badge-${kind}`}>
      {children ?? defaultLabels[kind]}
    </span>
  );
}
