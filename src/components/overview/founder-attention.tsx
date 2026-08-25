"use client";

import { useState } from "react";
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

function labelize(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

export function FounderAttention({
  feed,
  fallbackClients = [],
  currency,
}: FounderAttentionProps) {
  const resolvedCurrency = feed?.currencyCode ?? currency;
  const [expanded, setExpanded] = useState(false);
  const visibleFeedItems = feed
    ? expanded
      ? feed.items
      : feed.items.slice(0, 6)
    : [];

  return (
    <Panel
      title="What needs attention"
      description="Rule-based founder attention signals from canonical deterministic analytics."
    >
      {feed ? (
        feed.items.length ? (
          <div className="founder-attention-list">
            <div className="founder-attention-grid">
            {visibleFeedItems.map((item, index) => (
              <article
                className={`founder-attention-item attention-${item.severity.toLowerCase()}`}
                key={`${item.severity}-${item.entity}-${item.recommendedAttentionCategory}-${index}`}
              >
                <div className="attention-rank">
                  <StatusPill tone={item.severity === "HIGH" ? "critical" : "warning"}>
                    {item.severity}
                  </StatusPill>
                </div>
                <div className="attention-body">
                  <div className="attention-heading">
                    <strong>{item.entity}</strong>
                    <span>{item.client ?? item.relevantSource.replace("_", " ")}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.reason}</p>
                  {Object.keys(item.evidenceMetrics).length ? (
                    <dl className="attention-metrics">
                      {Object.entries(item.evidenceMetrics).map(([key, value]) => (
                        <div key={key}>
                          <dt>{labelize(key)}</dt>
                          <dd>{formatEvidenceValue(key, value, resolvedCurrency)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {item.dataQualityCaveat ? (
                    <p className="attention-caveat">Caveat: {item.dataQualityCaveat}</p>
                  ) : null}
                </div>
              </article>
            ))}
            </div>
            {feed.items.length > 6 && (
              <div className="list-actions">
                <span>Showing {formatNumber(visibleFeedItems.length)} of {formatNumber(feed.items.length)} deterministic signals</span>
                <button className="button button-secondary" type="button" onClick={() => setExpanded((current) => !current)}>
                  {expanded ? "Show less" : "Show all signals"}
                </button>
              </div>
            )}
            {feed.caveats.length ? (
              <div className="attention-feed-caveats">
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
