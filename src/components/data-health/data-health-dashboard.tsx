import type { DataQualityIssue, DataQualityReport } from "@/types/domain";
import { DataState } from "@/components/ui/data-state";
import { formatNumber } from "@/components/ui/formatters";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";

function issueTone(issue: DataQualityIssue) {
  if (issue.severity === "error") return "critical" as const;
  if (issue.severity === "warning") return "warning" as const;
  return "info" as const;
}

type DataHealthDashboardProps = { report?: DataQualityReport | null; loading?: boolean; error?: string | null };
export function DataHealthDashboard({ report, loading = false, error = null }: DataHealthDashboardProps) {
  if (loading) return <DataState state="loading" title="Assessing data health" />;
  if (error) return <DataState state="error" description={error} />;
  if (!report) return <DataState state="empty" title="Data-quality contract is ready" description="This page will surface canonical normalization issues, malformed records, and unmapped clients when the DataQualityReport endpoint is connected." />;

  return (
    <div className="dashboard-stack">
      <div className="metric-grid metric-grid-six">
        <MetricCard label="Deals assessed" value={formatNumber(report.totalDeals)} hint={`${formatNumber(report.malformedDeals)} malformed`} />
        <MetricCard label="Work Orders assessed" value={formatNumber(report.totalWorkOrders)} hint={`${formatNumber(report.malformedWorkOrders)} malformed`} />
        <MetricCard label="Unmapped WO clients" value={formatNumber(report.unmappedWorkOrderClients)} tone={report.unmappedWorkOrderClients > 0 ? "warning" : "neutral"} />
        <MetricCard label="Info notices" value={formatNumber(report.issueCounts.info)} />
        <MetricCard label="Warnings" value={formatNumber(report.issueCounts.warning)} tone={report.issueCounts.warning > 0 ? "warning" : "neutral"} />
        <MetricCard label="Errors" value={formatNumber(report.issueCounts.error)} tone={report.issueCounts.error > 0 ? "critical" : "neutral"} />
      </div>

      <Panel title="Normalization and quality notices" description="Professional visibility into source-data limitations without blocking usable intelligence.">
        {report.issues.length ? (
          <div className="issue-list">{report.issues.slice(0, 100).map((issue, index) => (
            <article className="issue-row" key={`${issue.code}-${issue.entityId ?? "dataset"}-${index}`}>
              <div className="issue-main"><div><StatusPill tone={issueTone(issue)}>{issue.severity}</StatusPill><strong>{issue.code}</strong></div><p>{issue.message}</p></div>
              <div className="issue-meta"><span>{issue.entityType.replace("_", " ")}</span>{issue.field && <span>Field: {issue.field}</span>}{issue.entityId && <span>ID: {issue.entityId}</span>}</div>
            </article>
          ))}</div>
        ) : <div className="success-state"><span aria-hidden="true">✓</span><div><strong>No quality issues reported</strong><p>The supplied report contains no normalization or source-data notices.</p></div></div>}
      </Panel>
    </div>
  );
}
