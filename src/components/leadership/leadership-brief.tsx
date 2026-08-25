import type { LeadershipBriefData } from "@/types/domain";
import { DataState } from "@/components/ui/data-state";
import { DistributionBars } from "@/components/ui/distribution-bars";
import { FinancialFlow } from "@/components/ui/financial-flow";
import { formatAmount, formatAmountFull, formatNumber } from "@/components/ui/formatters";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { VisualFlow } from "@/components/ui/visual-flow";
import { BriefActions } from "./brief-actions";

type LeadershipBriefProps = {
  brief?: LeadershipBriefData | null;
  currency?: string;
  loading?: boolean;
  error?: string | null;
};

function buildMarkdown(brief: LeadershipBriefData, currency?: string) {
  const p = brief.pipeline;
  const w = brief.workOrders;
  const lines = [
    "# Skylark Command — Leadership Brief",
    "",
    "## Executive Summary",
    `- Open pipeline: ${formatAmount(p.openPipelineValue, currency)} across ${formatNumber(p.openDeals)} open deals`,
    `- Open-deal value coverage: ${formatNumber(p.knownOpenValueDeals)} of ${formatNumber(p.openDeals)} known`,
    `- Active Work Orders: ${formatNumber(w.activeWorkOrders)} of ${formatNumber(w.totalWorkOrders)}`,
    `- Receivables: ${formatAmount(w.receivables, currency)}`,
    "",
    "## Commercial",
    `- Known won value: ${formatAmountFull(p.wonValue, currency)}`,
    `- Won deals: ${formatNumber(p.wonDeals)}`,
    `- Won-deal value coverage: ${formatNumber(p.knownWonValueDeals)} of ${formatNumber(p.wonDeals)} known; ${formatNumber(p.unknownWonValueDeals)} excluded from known won value`,
  ];

  for (const deal of brief.topOpenDeals.slice(0, 8)) {
    lines.push(`- ${deal.name}: ${formatAmount(deal.value, currency)} (${deal.stage ?? deal.status ?? "stage unavailable"})`);
  }

  lines.push(
    "",
    "## Operations",
    `- Active Work Orders: ${formatNumber(w.activeWorkOrders)}`,
    `- Delayed Work Orders: ${formatNumber(w.delayedWorkOrders)}`,
    `- Paused Work Orders: ${formatNumber(w.pausedWorkOrders)}`,
    `- AR-priority Work Orders: ${formatNumber(w.arPriorityWorkOrders)}`,
    "",
    "## Cash / Receivables",
    `- Receivables: ${formatAmount(w.receivables, currency)}`,
    `- Billed incl. GST: ${formatAmount(w.billedValueInclGst, currency)}`,
    `- Collected incl. GST: ${formatAmount(w.collectedAmountInclGst, currency)}`,
    `- To be billed incl. GST: ${formatAmount(w.amountToBeBilledInclGst, currency)}`,
    "",
    "## Attention Required",
  );

  for (const risk of brief.riskyDeals.slice(0, 10)) {
    lines.push(`- ${risk.name}: ${risk.reasons.join("; ")}`);
  }
  for (const client of brief.clientsWithCommercialAndOperationalExposure.slice(0, 10)) {
    lines.push(`- ${client.normalizedClientKey}: ${client.operationalRiskReasons.join("; ")}`);
  }

  lines.push(
    "",
    "## Data Caveats",
    `- Warnings: ${formatNumber(brief.dataQuality.issueCounts.warning)}`,
    `- Errors: ${formatNumber(brief.dataQuality.issueCounts.error)}`,
    `- Unmapped Work Order clients: ${formatNumber(brief.dataQuality.unmappedWorkOrderClients)}`,
    `- Open deals with missing value: ${formatNumber(p.unknownOpenValueDeals)}`,
    `- Work Orders with unknown receivable value: ${formatNumber(w.unknownReceivableCount)}`,
  );

  return lines.join("\n");
}

export function LeadershipBrief({
  brief,
  currency,
  loading = false,
  error = null,
}: LeadershipBriefProps) {
  if (loading) return <DataState state="loading" title="Preparing leadership brief" />;
  if (error) return <DataState state="error" description={error} />;
  if (!brief) return <DataState state="empty" title="Leadership Brief is integration-ready" description="The brief UI consumes LeadershipBriefData directly and will not manufacture executive conclusions before canonical analytics are supplied." />;

  const markdown = buildMarkdown(brief, currency);
  const p = brief.pipeline;
  const w = brief.workOrders;
  const valueCoverage = p.openDeals
    ? `${formatNumber(p.knownOpenValueDeals)} of ${formatNumber(p.openDeals)} open opportunities have known values.`
    : "No open opportunities are currently reported.";
  const wonCoverage = p.wonDeals
    ? `${formatNumber(p.knownWonValueDeals)} of ${formatNumber(p.wonDeals)} won deals have known values; ${formatNumber(p.unknownWonValueDeals)} are excluded from known won value.`
    : "No won deals are currently reported.";

  return (
    <div className="dashboard-stack brief-layout leadership-brief-premium">
      <BriefActions markdown={markdown} />

      <VisualFlow
        ariaLabel="Leadership story from commercial position through delivery, cash, and attention"
        nodes={[
          { eyebrow: "Commercial", value: formatAmount(p.openPipelineValue, currency), detail: valueCoverage, tone: "info" },
          { eyebrow: "Delivery", value: `${formatNumber(w.activeWorkOrders)} active WOs`, detail: `${formatNumber(w.delayedWorkOrders)} delayed · ${formatNumber(w.pausedWorkOrders)} paused`, tone: w.delayedWorkOrders > 0 ? "warning" : "positive" },
          { eyebrow: "Cash", value: formatAmount(w.receivables, currency), detail: `${formatNumber(w.unknownReceivableCount)} unknown receivable values`, tone: "warning" },
          { eyebrow: "Attention", value: `${formatNumber(brief.riskyDeals.length)} deal risks`, detail: `${formatNumber(brief.clientsWithCommercialAndOperationalExposure.length)} cross-functional client signals`, tone: brief.riskyDeals.length ? "critical" : "neutral" },
        ]}
        caption="Each step is sourced from the deterministic leadership-brief contract; the sequence is narrative presentation only."
      />

      <Panel title="Executive Summary" description="A concise, evidence-backed snapshot for leadership review.">
        <div className="metric-grid metric-grid-four executive-metric-grid">
          <MetricCard label="Open pipeline" value={formatAmount(p.openPipelineValue, currency)} exactValue={formatAmountFull(p.openPipelineValue, currency)} hint={valueCoverage} />
          <MetricCard label="Known won value" value={formatAmount(p.wonValue, currency)} exactValue={formatAmountFull(p.wonValue, currency)} hint={wonCoverage} tone="positive" />
          <MetricCard label="Active WOs" value={formatNumber(w.activeWorkOrders)} hint={`${formatNumber(w.totalWorkOrders)} total`} />
          <MetricCard label="Known receivables" value={formatAmount(w.receivables, currency)} exactValue={formatAmountFull(w.receivables, currency)} hint={`${formatNumber(w.unknownReceivableCount)} unknown values`} />
        </div>
        <div className="brief-summary-copy">
          <p>Commercial reporting covers {formatNumber(p.openDeals)} open opportunities and {formatNumber(p.wonDeals)} won deals.</p>
          <p>Operations reporting covers {formatNumber(w.totalWorkOrders)} Work Orders, including {formatNumber(w.delayedWorkOrders)} delayed and {formatNumber(w.pausedWorkOrders)} paused.</p>
        </div>
      </Panel>

      <Panel title="Commercial" description="Open opportunity and won-business facts supplied by deterministic analytics.">
        <div className="section-metric-row">
          <div><span>Open deals</span><strong>{formatNumber(p.openDeals)}</strong></div>
          <div><span>Active deals</span><strong>{formatNumber(p.activeDeals)}</strong></div>
          <div><span>Won deals</span><strong>{formatNumber(p.wonDeals)}</strong></div>
          <div><span>Average open deal</span><strong>{formatAmount(p.averageOpenDealSize, currency)}</strong></div>
        </div>
        <div className="commercial-coverage" role="note">
          <strong>Known won value coverage</strong>
          <span>{wonCoverage}</span>
        </div>
        {brief.topOpenDeals.length ? (
          <div className="compact-list leadership-list">
            {brief.topOpenDeals.slice(0, 8).map((deal) => (
              <div key={deal.mondayItemId}>
                <div><strong>{deal.name}</strong><span>{deal.normalizedClientKey ?? deal.clientCode ?? "Client unavailable"}</span></div>
                <div className="compact-value"><strong>{formatAmount(deal.value, currency)}</strong><span>{deal.stage ?? deal.status ?? "Stage unavailable"}</span></div>
              </div>
            ))}
          </div>
        ) : <p className="muted-copy">No open deals were supplied.</p>}
      </Panel>

      <div className="split-grid">
        <Panel title="Operations" description="Delivery posture from the canonical Work Order health contract.">
          <DistributionBars
            ariaLabel="Leadership Work Order delivery posture"
            items={[
              { label: "Completed", value: w.completedWorkOrders },
              { label: "Active", value: w.activeWorkOrders },
              { label: "Ongoing", value: w.ongoingWorkOrders },
              { label: "Delayed", value: w.delayedWorkOrders },
              { label: "Paused", value: w.pausedWorkOrders },
              { label: "AR priority", value: w.arPriorityWorkOrders },
            ]}
          />
        </Panel>
        <Panel title="Cash / Receivables" description="GST-inclusive billing and collection values remain separated exactly as defined by the source contract.">
          <FinancialFlow
            totalAmount={w.totalAmountInclGst}
            billed={w.billedValueInclGst}
            collected={w.collectedAmountInclGst}
            toBeBilled={w.amountToBeBilledInclGst}
            receivables={w.receivables}
            currency={currency}
          />
        </Panel>
      </div>

      <Panel title="Attention Required" description="Only canonical deterministic risk signals are shown; the UI does not invent severity.">
        <div className="attention-grid">
          <div>
            <h3>Risky deals</h3>
            {brief.riskyDeals.length ? (
              <div className="compact-list leadership-list">
                {brief.riskyDeals.slice(0, 6).map((risk) => (
                  <div key={risk.mondayItemId}>
                    <div><strong>{risk.name}</strong><span>{risk.reasons.join(" · ")}</span></div>
                    <StatusPill tone="warning">Review</StatusPill>
                  </div>
                ))}
              </div>
            ) : <p className="muted-copy">No risky deals supplied.</p>}
          </div>
          <div>
            <h3>Cross-functional exposure</h3>
            {brief.clientsWithCommercialAndOperationalExposure.length ? (
              <div className="compact-list leadership-list">
                {brief.clientsWithCommercialAndOperationalExposure.slice(0, 6).map((client) => (
                  <div key={client.normalizedClientKey}>
                    <div><strong>{client.normalizedClientKey}</strong><span>{client.operationalRiskReasons.join(" · ")}</span></div>
                    <StatusPill tone="warning">Combined exposure</StatusPill>
                  </div>
                ))}
              </div>
            ) : <p className="muted-copy">No combined client exposure supplied.</p>}
          </div>
        </div>
      </Panel>

      <Panel title="Data Caveats" description="Coverage and quality limitations that should accompany every executive interpretation.">
        <div className="quality-summary quality-summary-five">
          <div><strong>{formatNumber(brief.dataQuality.issueCounts.warning)}</strong><span>Warnings</span></div>
          <div><strong>{formatNumber(brief.dataQuality.issueCounts.error)}</strong><span>Errors</span></div>
          <div><strong>{formatNumber(brief.dataQuality.unmappedWorkOrderClients)}</strong><span>Unmapped WO clients</span></div>
          <div><strong>{formatNumber(p.unknownOpenValueDeals)}</strong><span>Open deals missing value</span></div>
          <div><strong>{formatNumber(p.unknownWonValueDeals)}</strong><span>Won deals missing value</span></div>
        </div>
        <div className="caveat-inline-list">
          <p>{valueCoverage}</p>
          <p>{formatNumber(w.unknownReceivableCount)} Work Orders have unknown receivable values.</p>
          <p>{formatNumber(w.unknownAmountCount)} Work Orders have unknown total amount values.</p>
        </div>
      </Panel>
    </div>
  );
}
