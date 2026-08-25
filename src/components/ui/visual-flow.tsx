import type { ReactNode } from "react";

export type VisualFlowNode = {
  eyebrow: string;
  value: ReactNode;
  detail: string;
  tone?: "neutral" | "positive" | "warning" | "critical" | "info";
};

type VisualFlowProps = {
  ariaLabel: string;
  nodes: VisualFlowNode[];
  caption?: string;
};

export function VisualFlow({ ariaLabel, nodes, caption }: VisualFlowProps) {
  return (
    <figure className="visual-flow" aria-label={ariaLabel}>
      <div className="visual-flow-track">
        {nodes.map((node, index) => (
          <div className="visual-flow-step" key={`${node.eyebrow}-${index}`}>
            <article className={`visual-flow-node visual-flow-${node.tone ?? "neutral"}`}>
              <span>{node.eyebrow}</span>
              <strong>{node.value}</strong>
              <p>{node.detail}</p>
            </article>
            {index < nodes.length - 1 && <span className="visual-flow-connector" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>
      {caption && <figcaption className="visual-flow-caption">{caption}</figcaption>}
    </figure>
  );
}
