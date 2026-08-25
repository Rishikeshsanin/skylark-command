import type { ClientIntelligence } from "@/types/domain";
import { formatAmount, formatNumber } from "@/components/ui/formatters";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";

export type FounderAttentionItem = {
  id: string;
  severity: "high" | "medium";
  entity: string;
  entityType?: string;
  reason: string;
  evidence?: string[];
  caveat?: string;
};

type FounderAttentionProps = {
  items?: FounderAttentionItem[] | null;
  fallbackClients?: ClientIntelligence[];
  currency?: string;
};

export function FounderAttention({
  items,
  fallbackClients = [],
  currency,
}: FounderAttentionProps) {
  const hasCanonicalAttention = Array.isArray(items);

  return (
    <Panel
      title="What needs attention"
      description="Leadership-priority signals. Severity is shown only when supplied by a canonical attention contract."
    >
      {hasCanonicalAttention ? (
        items.length ? (
          <div className="founder-attention-list">
            {items.map((item) => (
              <article className={`founder-attention-item attention-${item.severity}`} key={item.id}>
                <div className="attention-rank">
                  <StatusPill tone={item.severity === "high" ? "critical" : "warning"}>
                    {item.severity.toUpperCase()}
                  </StatusPill>
                </div>
                <div className="attention-body">
                  <div className="attention-heading">
                    <strong>{item.entity}</strong>
                    {item.entityType ? <span>{item.entityType}</span> : null}
                  </div>
                  <p>{item.reason}</p>
                  {item.evidence?.length ? (
                    <ul className="attention-evidence">
                      {item.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
                    </ul>
                  ) : null}
                  {item.caveat ? <p className="attention-caveat">Caveat: {item.caveat}</p> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted-copy">No canonical Founder Attention items are currently reported.</p>
        )
      ) : (
        <div className="attention-unranked">
          <div className="attention-contract-note">
            <strong>Severity ranking is contract-ready.</strong>
            <span>No HIGH/MEDIUM level is inferred by the UI until canonical Founder Attention data is supplied.</span>
          </div>
          {fallbackClients.length ? (
            <div className="compact-list">
              {fallbackClients.slice(0, 6).map((client) => (
                <div key={client.normalizedClientKey}>
                  <div>
                    <strong>{client.normalizedClientKey}</strong>
                    <span>{client.operationalRiskReasons.join(" · ") || "Combined commercial and operational exposure"}</span>
                  </div>
                  <div className="compact-value">
                    <StatusPill tone="neutral">Unranked signal</StatusPill>
                    <span>
                      {formatNumber(client.openDealCount)} open deals · {formatNumber(client.activeWorkOrderCount)} active WOs · {formatAmount(client.receivables, currency)} receivables
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">No deterministic combined-exposure signals are currently reported.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
