import type {
  ClientIntelligence,
  FounderAttentionFeed,
  FounderAttentionItem,
} from "@/types";
import { formatAmount, formatNumber } from "@/components/ui/formatters";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";

type FounderAttentionProps = {
  feed?: FounderAttentionFeed | null;
  fallbackClients?: ClientIntelligence[];
  currency?: string;
};

function formatEvidenceValue(
  key: string,
  value: FounderAttentionItem["evidenceMetrics"][string],
  currencyCode?: string,
) {
  if (value === null) return "Unavailable";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") return value;
  const monetary = /value|amount|receivable|pipeline|exposure/i.test(key);
  return monetary ? formatAmount(value, currencyCode) : formatNumber(value, 1);
}

function evidenceValue(item: FounderAttentionItem, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(item.evidenceMetrics, key)) {
      return { key, value: item.evidenceMetrics[key] };
    }
  }
  return null;
}

function attentionValue(
  item: FounderAttentionItem,
  keys: string[],
  currencyCode?: string,
) {
  const evidence = evidenceValue(item, keys);
  return evidence
    ? formatEvidenceValue(evidence.key, evidence.value, currencyCode)
    : "—";
}

function AttentionReason({ item }: { item: FounderAttentionItem }) {
  return (
    <details className="attention-reason-detail">
      <summary>{item.title}</summary>
      <div>
        <p>{item.reason}</p>
        {item.dataQualityCaveat ? (
          <p className="attention-caveat">Data caveat: {item.dataQualityCaveat}</p>
        ) : null}
      </div>
    </details>
  );
}

export function FounderAttention({
  feed,
  fallbackClients = [],
  currency,
}: FounderAttentionProps) {
  const resolvedCurrency = feed?.currencyCode ?? currency;
  const attentionItems = feed?.items.slice(0, 10) ?? [];

  return (
    <Panel
      title="What needs attention"
      description="Rule-based founder attention signals from canonical deterministic analytics."
    >
      {feed ? (
        attentionItems.length ? (
          <div className="founder-attention-list">
            <div className="attention-table-wrap">
              <table className="attention-table">
                <caption className="sr-only">Ranked founder attention items</caption>
                <thead>
                  <tr>
                    <th scope="col">Priority</th>
                    <th scope="col">Customer</th>
                    <th scope="col">Reason</th>
                    <th scope="col" className="attention-number">Receivables</th>
                    <th scope="col" className="attention-number">AR Priority WOs</th>
                    <th scope="col" className="attention-number">Work Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {attentionItems.map((item, index) => (
                    <tr key={`${item.severity}-${item.entity}-${item.recommendedAttentionCategory}-${index}`}>
                      <td>
                        <StatusPill tone={item.severity === "HIGH" ? "critical" : "warning"}>
                          {item.severity}
                        </StatusPill>
                      </td>
                      <td className="attention-customer"><strong>{item.client ?? item.entity}</strong></td>
                      <td className="attention-reason"><AttentionReason item={item} /></td>
                      <td className="attention-number">
                        {attentionValue(item, ["receivables", "amountReceivable"], resolvedCurrency)}
                      </td>
                      <td className="attention-number">
                        {attentionValue(item, ["arPriorityWorkOrders"], resolvedCurrency)}
                      </td>
                      <td className="attention-number">
                        {attentionValue(item, ["workOrders", "activeWorkOrders"], resolvedCurrency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="attention-mobile-list" role="list" aria-label="Ranked founder attention items">
              {attentionItems.map((item, index) => (
                <article
                  className={`attention-mobile-item attention-${item.severity.toLowerCase()}`}
                  key={`${item.severity}-${item.entity}-${item.recommendedAttentionCategory}-${index}`}
                  role="listitem"
                >
                  <div className="attention-mobile-heading">
                    <StatusPill tone={item.severity === "HIGH" ? "critical" : "warning"}>
                      {item.severity}
                    </StatusPill>
                    <strong>{item.client ?? item.entity}</strong>
                  </div>
                  <div className="attention-mobile-reason"><AttentionReason item={item} /></div>
                  <dl className="attention-mobile-metrics">
                    <div>
                      <dt>Receivables</dt>
                      <dd>{attentionValue(item, ["receivables", "amountReceivable"], resolvedCurrency)}</dd>
                    </div>
                    <div>
                      <dt>AR WOs</dt>
                      <dd>{attentionValue(item, ["arPriorityWorkOrders"], resolvedCurrency)}</dd>
                    </div>
                    <div>
                      <dt>WOs</dt>
                      <dd>{attentionValue(item, ["workOrders", "activeWorkOrders"], resolvedCurrency)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            {feed.caveats.length ? (
              <div className="attention-feed-caveats" role="note" aria-label="Attention data caveats">
                {feed.caveats.map((caveat) => <p key={caveat}>{caveat}</p>)}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="muted-copy">No canonical Founder Attention items are currently reported.</p>
        )
      ) : (
        <div className="attention-unranked">
          <div className="attention-contract-note">
            <strong>Founder Attention feed unavailable.</strong>
            <span>No HIGH/MEDIUM level is inferred by the UI.</span>
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
