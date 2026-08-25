"use client";

import { useState } from "react";
import type { DataQualityIssue, DataQualityReport } from "@/types/domain";
import { DataState } from "@/components/ui/data-state";
import { formatNumber } from "@/components/ui/formatters";
import { MetricCard } from "@/components/ui/metric-card";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { VisualFlow } from "@/components/ui/visual-flow";

const ISSUE_BATCH_SIZE = 24;
const issueFilters = ["all", "error", "warning", "info"] as const;
type IssueFilter = (typeof issueFilters)[number];

function issueTone(issue: DataQualityIssue) {
  if (issue.severity === "error") return "critical" as const;
  if (issue.severity === "warning") return "warning" as const;
  return "info" as const;
}

function filterLabel(filter: IssueFilter) {
  return filter === "all" ? "All notices" : `${filter[0].toUpperCase()}${filter.slice(1)}`;
}

type DataHealthDashboardProps = { report?: DataQualityReport | null; loading?: boolean; error?: string | null };

export function DataHealthDashboard({ report, loading = false, error = null }: DataHealthDashboardProps) {
  const [filter, setFilter] = useState<IssueFilter>("all");
  const [visibleCount, setVisibleCount] = useState(ISSUE_BATCH_SIZE);

  if (loading) return <DataState state="loading" title="Assessing data health" />;
  if (error) return <DataState state="error" description={error} />;
  if (!report) return <DataState state="empty" title="Data-quality contract is ready" description="This page will surface canonical normalization issues, malformed records, and unmapped clients when the DataQualityReport endpoint is connected." />;

  const filteredIssues = filter === "all"
    ? report.issues
    : report.issues.filter((issue) => issue.severity === filter);
  const visibleIssues = filteredIssues.slice(0, visibleCount);

  function selectFilter(nextFilter: IssueFilter) {
    setFilter(nextFilter);
    setVisibleCount(ISSUE_BATCH_SIZE);
  }

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

      <Panel title="Data trust flow" description="How source records become founder-ready intelligence while deterministic boundaries remain visible.">
        <VisualFlow
          ariaLabel="Data trust flow from monday.com through normalization and deterministic analytics to optional explanation"
          nodes={[
            { eyebrow: "monday.com", value: `${formatNumber(report.totalDeals)} deals`, detail: `${formatNumber(report.totalWorkOrders)} Work Orders`, tone: "info" },
            { eyebrow: "Normalization", value: `${formatNumber(report.malformedDeals)} malformed deals`, detail: `${formatNumber(report.malformedWorkOrders)} malformed Work Orders`, tone: report.malformedDeals || report.malformedWorkOrders ? "warning" : "positive" },
            { eyebrow: "Deterministic analytics", value: `${formatNumber(report.issueCounts.warning)} warnings`, detail: `${formatNumber(report.issueCounts.error)} errors · ${formatNumber(report.unmappedWorkOrderClients)} unmapped WO clients`, tone: report.issueCounts.error ? "critical" : "warning" },
            { eyebrow: "Executive explanation", value: "Gemini optional", detail: "Explanation only · no business arithmetic", tone: "neutral" },
          ]}
          caption="The UI presents the supplied quality report and never converts missing records into invented business values."
        />
        {report.unmappedWorkOrderClientKeys.length > 0 && (
          <p className="unmapped-key-note"><strong>Unmapped Work Order client keys:</strong> {report.unmappedWorkOrderClientKeys.join(", ")}</p>
        )}
      </Panel>

      <Panel title="Normalization and quality notices" description="Filter and progressively review source-data limitations without losing record-level evidence." className="quality-notices-panel">
        {report.issues.length ? (
          <>
            <div className="issue-toolbar">
              <div className="issue-filters" role="group" aria-label="Filter quality notices by severity">
                {issueFilters.map((item) => {
                  const count = item === "all" ? report.issues.length : report.issueCounts[item];
                  return (
                    <button
                      className={`issue-filter${filter === item ? " issue-filter-active" : ""}`}
                      type="button"
                      key={item}
                      aria-pressed={filter === item}
                      onClick={() => selectFilter(item)}
                    >
                      {filterLabel(item)} <span>{formatNumber(count)}</span>
                    </button>
                  );
                })}
              </div>
              <span className="issue-result-count" aria-live="polite">Showing {formatNumber(visibleIssues.length)} of {formatNumber(filteredIssues.length)}</span>
            </div>

            {visibleIssues.length ? (
              <div className="issue-list" id="quality-issue-list">
                {visibleIssues.map((issue, index) => (
                  <article className="issue-row" key={`${issue.code}-${issue.entityId ?? "dataset"}-${index}`}>
                    <div className="issue-main">
                      <div><StatusPill tone={issueTone(issue)}>{issue.severity}</StatusPill><strong>{issue.code}</strong></div>
                      <p>{issue.message}</p>
                    </div>
                    <div className="issue-meta">
                      <span>{issue.entityType.replace("_", " ")}</span>
                      {issue.field && <span>Field: {issue.field}</span>}
                      {issue.entityId && <span>ID: {issue.entityId}</span>}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted-copy issue-empty">No {filterLabel(filter).toLowerCase()} are present in the supplied report.</p>
            )}

            {visibleIssues.length < filteredIssues.length && (
              <div className="list-actions list-actions-centered">
                <span>{formatNumber(filteredIssues.length - visibleIssues.length)} more notices remain in this filter</span>
                <button
                  className="button button-secondary"
                  type="button"
                  aria-controls="quality-issue-list"
                  onClick={() => setVisibleCount((current) => current + ISSUE_BATCH_SIZE)}
                >
                  Show more notices
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="success-state"><span aria-hidden="true">✓</span><div><strong>No quality issues reported</strong><p>The supplied report contains no normalization or source-data notices.</p></div></div>
        )}
      </Panel>
    </div>
  );
}
