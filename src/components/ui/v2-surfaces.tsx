import type { ReactNode } from "react";
import { InsightBadge } from "./insight-badge";

type SurfaceKind = "customer" | "change" | "scenario";

type ProductSurfaceShellProps = {
  title: string;
  description: string;
  eyebrow: string;
  kind: SurfaceKind;
  actions?: ReactNode;
  children: ReactNode;
};

const shellClass: Record<SurfaceKind, string> = {
  customer: "customer-360-shell",
  change: "change-detective-shell",
  scenario: "scenario-lab-shell",
};

export function ProductSurfaceShell({
  title,
  description,
  eyebrow,
  kind,
  actions,
  children,
}: ProductSurfaceShellProps) {
  return (
    <section className={`product-surface-shell ${shellClass[kind]}`}>
      <header className="product-surface-header">
        <div>
          <p className="product-surface-eyebrow">{eyebrow}</p>
          <h2 className="product-surface-title">{title}</h2>
          <p className="product-surface-description">{description}</p>
        </div>
        {actions ? <div className="product-surface-actions">{actions}</div> : null}
      </header>
      <div className="product-surface-body">{children}</div>
    </section>
  );
}

type NamedSurfaceProps = Omit<ProductSurfaceShellProps, "eyebrow" | "kind">;

export function Customer360Shell(props: NamedSurfaceProps) {
  return <ProductSurfaceShell eyebrow="Customer 360" kind="customer" {...props} />;
}

export function ChangeDetectiveShell(props: NamedSurfaceProps) {
  return <ProductSurfaceShell eyebrow="Change Detective" kind="change" {...props} />;
}

export function ScenarioLabShell(props: NamedSurfaceProps) {
  return <ProductSurfaceShell eyebrow="Scenario Lab" kind="scenario" {...props} />;
}

export function TimelineHistory({
  children,
  ariaLabel = "History timeline",
}: {
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div className="timeline-history" role="list" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

export function TimelineEvent({ children }: { children: ReactNode }) {
  return (
    <div className="timeline-event" role="listitem">
      {children}
    </div>
  );
}

export function PredictiveEstimatePresentation({
  value,
  children,
}: {
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="predictive-estimate">
      <InsightBadge kind="estimate" />
      <div className="predictive-estimate-value">{value}</div>
      {children ? <div className="predictive-estimate-copy">{children}</div> : null}
    </div>
  );
}
