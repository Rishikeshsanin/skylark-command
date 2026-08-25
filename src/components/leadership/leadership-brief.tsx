import type { LeadershipBriefData } from "@/types/domain";
import { DataState } from "@/components/ui/data-state";
import { formatAmount, formatNumber } from "@/components/ui/formatters";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { BriefActions } from "./brief-actions";

type LeadershipBriefProps = { brief?: LeadershipBriefData | null; currency?: string; loading?: boolean; error?: string | null };

function buildMarkdown(brief: LeadershipBriefData, currency?: string) {
  const p = brief.pipeline, w = brief.workOrders;
  const lines = ["# Skylark Command — Leadership Brief", "", "## Pipeline", `- Open deals: ${formatNumber(p.openDeals)}`, `- Open pipeline: ${formatAmount(p.openPipelineValue, currency)}`, `- Won value: ${formatAmount(p.wonValue, currency)}`, "", "## Operations", `- Active Work Orders: ${formatNumber(w.activeWorkOrders)}`, `- Delayed Work Orders: ${formatNumber(w.delayedWorkOrders)}`, `- Receivables: ${formatAmount(w.receivables, currency)}`, "", "## Attention Required"];
  for (const risk of brief.riskyDeals.slice(0, 10)) lines.push(`- ${risk.name}: ${risk.reasons.join("; ")}`);
  lines.push("", "## Data Quality", `- Warnings: ${formatNumber(brief.dataQuality.issueCounts.warning)}`, `- Errors: ${formatNumber(brief.dataQuality.issueCounts.error)}`);
  return lines.join("\n");
}

export function LeadershipBrief({ brief, currency, loading = false, error = null }: LeadershipBriefProps) {
  if (loading) return <DataState state="loading" title="Preparing leadership brief" />;
  if (error) return <DataState state="error" description={error} />;
  if (!brief) return <DataState state="empty" title="Leadership Brief is integration-ready" description="The brief UI consumes LeadershipBriefData directly and will not manufacture executive conclusions before canonical analytics are supplied." />;

  const markdown = buildMarkdown(brief, currency);
  return (
    <div className="dashboard-stack brief-layout">
      <BriefActions markdown={markdown} />
      <Panel title="Executive summary" description="A concise, evidence-backed view of commercial and operational posture.">
        <div className="metric-grid metric-grid-four"><MetricCard label="Open pipeline" value={formatAmount(brief.pipeline.openPipelineValue, currency)} hint={`${formatNumber(brief.pipeline.openDeals)} open deals`} /><MetricCard label="Won value" value={formatAmount(brief.pipeline.wonValue, currency)} tone="positive" /><MetricCard label="Active WOs" value={formatNumber(brief.workOrders.activeWorkOrders)} /><MetricCard label="Receivables" value={formatAmount(brief.workOrders.receivables, currency)} /></div>
      </Panel>

      <div className="split-grid">
        <Panel title="Pipeline" description="Largest open opportunities supplied by the canonical brief.">
          {brief.topOpenDeals.length ? <div className="compact-list">{brief.topOpenDeals.slice(0, 8).map((deal) => <div key={deal.mondayItemId}><div><strong>{deal.name}</strong><span>{deal.normalizedClientKey ?? deal.clientCode ?? "Client unavailable"}</span></div><div className="compact-value"><strong>{formatAmount(deal.value, currency)}</strong><span>{deal.stage ?? deal.status ?? "Stage unavailable"}</span></div></div>)}</div> : <p className="muted-copy">No open deals were supplied.</p>}
        </Panel>
        <Panel title="Operations & receivables" description="Execution health and collection exposure.">
          <div className="summary-list"><div><span>Delayed</span><strong>{formatNumber(brief.workOrders.delayedWorkOrders)}</strong></div><div><span>Paused</span><strong>{formatNumber(brief.workOrders.pausedWorkOrders)}</strong></div><div><span>AR priority</span><strong>{formatNumber(brief.workOrders.arPriorityWorkOrders)}</strong></div><div><span>To be billed</span><strong>{formatAmount(brief.workOrders.amountToBeBilledInclGst, currency)}</strong></div></div>
        </Panel>
      </div>

      <Panel title="Attention required" description="Commercial and operational risks that merit leadership review.">
        <div className="attention-grid">
          <div><h3>Risky deals</h3>{brief.riskyDeals.length ? <div className="compact-list">{brief.riskyDeals.slice(0, 6).map((risk) => <div key={risk.mondayItemId}><div><strong>{risk.name}</strong><span>{risk.reasons.join(" · ")}</span></div><StatusPill tone="warning">Review</StatusPill></div>)}</div> : <p className="muted-copy">No risky deals supplied.</p>}</div>
          <div><h3>Cross-functional exposure</h3>{brief.clientsWithCommercialAndOperationalExposure.length ? <div className="compact-list">{brief.clientsWithCommercialAndOperationalExposure.slice(0, 6).map((client) => <div key={client.normalizedClientKey}><div><strong>{client.normalizedClientKey}</strong><span>{client.operationalRiskReasons.join(" · ")}</span></div><StatusPill tone="warning">Combined risk</StatusPill></div>)}</div> : <p className="muted-copy">No combined client exposure supplied.</p>}</div>
        </div>
      </Panel>

      <Panel title="Data quality" description="Context leaders should consider when interpreting this brief.">
        <div className="quality-summary"><div><strong>{formatNumber(brief.dataQuality.issueCounts.warning)}</strong><span>Warnings</span></div><div><strong>{formatNumber(brief.dataQuality.issueCounts.error)}</strong><span>Errors</span></div><div><strong>{formatNumber(brief.dataQuality.unmappedWorkOrderClients)}</strong><span>Unmapped WO clients</span></div><div><strong>{formatNumber(brief.dataQuality.malformedDeals)}</strong><span>Malformed deals</span></div></div>
      </Panel>
    </div>
  );
}
