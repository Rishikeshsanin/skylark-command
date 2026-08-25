import type { ReactNode } from "react";

type StatusPillProps = { children: ReactNode; tone?: "neutral" | "positive" | "warning" | "critical" | "info" };
export function StatusPill({ children, tone = "neutral" }: StatusPillProps) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}
