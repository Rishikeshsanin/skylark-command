import type { ReactNode } from "react";

type PanelProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Panel({ title, description, action, children, className = "" }: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      {(title || description || action) && (
        <div className="panel-header">
          <div>
            {title && <h2 className="panel-title">{title}</h2>}
            {description && <p className="panel-description">{description}</p>}
          </div>
          {action && <div className="panel-action">{action}</div>}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}
