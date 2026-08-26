"use client";

import { useMemo } from "react";
import type { AgentResponse } from "@/types";
import type { AnalysisTrustTrace } from "@/lib/agent/v2/contracts";
import {
  clarificationOptionsFor,
  presentationFor,
} from "@/components/copilot/founder-copilot";
import { structuredDataLines } from "@/components/copilot/structured-data";
import {
  buildVisualAnalytics,
  CopilotVisualAnalytics,
} from "@/components/copilot/visual-analytics";
import {
  formatAmount,
  formatDateTime,
  formatNumber,
} from "@/components/ui/formatters";
import { StatusPill } from "@/components/ui/status-pill";

type CopilotResponseState =
  | "SUCCESS"
  | "GREETING"
  | "NEEDS_CLARIFICATION"
  | "NO_MATCH"
  | "OUT_OF_SCOPE"
  | "PARTIAL_DATA"
  | "ERROR";

type CopilotFollowUp = { label: string; query: string };

export type V2UiResponse = AgentResponse & {
  responseState?: CopilotResponseState;
  followUps?: CopilotFollowUp[];
  analysis?: AnalysisTrustTrace;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function formatFilter(trace: AnalysisTrustTrace["filters"][number]): string {
  const value = Array.isArray(trace.value) ? trace.value.join(", ") : String(trace.value);
  return `${trace.field} ${trace.operator} ${value}`;
}

function stateFor(response: V2UiResponse): CopilotResponseState {
  if (response.responseState) return response.responseState;
  if (response.clarification?.required) return "NEEDS_CLARIFICATION";
  return response.ok ? "SUCCESS" : "ERROR";
}

function statePresentation(state: CopilotResponseState): {
  label: string;
  tone: "neutral" | "positive" | "warning" | "critical" | "info";
} {
  switch (state) {
    case "SUCCESS": return { label: "Grounded answer", tone: "positive" };
    case "GREETING": return { label: "Founder Copilot", tone: "info" };
    case "NEEDS_CLARIFICATION": return { label: "Clarification needed", tone: "warning" };
    case "NO_MATCH": return { label: "No match", tone: "warning" };
    case "OUT_OF_SCOPE": return { label: "Outside business scope", tone: "neutral" };
    case "PARTIAL_DATA": return { label: "Partial data", tone: "warning" };
    case "ERROR": return { label: "Controlled error", tone: "critical" };
  }
}

function formatMetricValue(
  label: string,
  value: string | number,
  currencyCode?: string,
) {
  if (typeof value !== "number") return value;
  const looksMonetary =
    /value|amount|receivable|pipeline|revenue|billing|collected|cash|won|exposure/i.test(label);
  return looksMonetary && currencyCode
    ? formatAmount(value, currencyCode)
    : formatNumber(value);
}

function isCriticalCaveat(caveat: string): boolean {
  return /\b(?:no data|no records|not available|cannot|critical|limited coverage|missing|unmapped)\b/i.test(caveat);
}

function ScenarioTriptych({ response }: { response: AgentResponse }) {
  const record = asRecord(response.data);
  if (record?.kind !== "scenario_comparison") return null;
  const sections = [
    ["BASELINE", record.baseline],
    ["SCENARIO", record.scenario],
    ["DELTA", record.delta],
  ] as const;

  return (
    <section className="answer-section" aria-label="Scenario comparison">
      <p className="answer-section-label">Scenario Lab</p>
      <div className="answer-metrics">
        {sections.map(([label, value]) => {
          const lines = structuredDataLines(value).slice(0, 8);
          return (
            <div key={label}>
              <span>{label}</span>
              <ul className="executive-list">
                {lines.length
                  ? lines.map((line) => <li key={line}>{line}</li>)
                  : <li>No numeric change in this view.</li>}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="answer-text">
        Scenario values are hypothetical and never written back to monday.com.
      </p>
    </section>
  );
}

function TrustTrace({ response }: { response: V2UiResponse }) {
  const trace = response.analysis;
  if (!trace || (!trace.sourceSnapshot && trace.toolsUsed.length === 0)) return null;

  const trust = trace.semanticTrust;
  const lineage = trust?.lineage;

  return (
    <details className="answer-section copilot-supplied-details copilot-trust-details">
      <summary>Why should I trust this?</summary>
      <div className="copilot-trust-grid">
        <div>
          <strong>Execution</strong>
          <ul className="executive-list">
            <li>Planner: {trace.planner}</li>
            <li>
              Tools: {trace.toolsUsed.length ? trace.toolsUsed.join(" → ") : "No analytical tool executed"}
            </li>
            <li>
              Filters: {trace.filters.length ? trace.filters.map(formatFilter).join(" · ") : "None"}
            </li>
            <li>
              Semantic metrics: {trace.semanticMetricIds.length
                ? trace.semanticMetricIds.join(", ")
                : "None"}
            </li>
          </ul>
        </div>

        <div>
          <strong>Source & freshness</strong>
          <ul className="executive-list">
            <li>Snapshot: {trace.sourceSnapshot?.id ?? "No analytical snapshot loaded"}</li>
            <li>Fetched: {trace.sourceSnapshot?.fetchedAt
              ? formatDateTime(trace.sourceSnapshot.fetchedAt)
              : "Not applicable"}</li>
            <li>Boards: {trace.sourceSnapshot?.boardIds.join(", ") || "Not applicable"}</li>
            <li>
              Evidence rows: {trace.evidence.dealCount} Deals · {trace.evidence.workOrderCount} Work Orders
            </li>
          </ul>
        </div>

        {trust ? (
          <div>
            <strong>Semantic definition</strong>
            <ul className="executive-list">
              <li>
                Evidence quality: {trust.evidenceQuality.status} · policy {trust.evidenceQuality.policyVersion}
              </li>
              {trust.metrics.map((metric) => (
                <li key={metric.id}>
                  {metric.label}: {metric.id}@{metric.semanticVersion} · {metric.aggregation} of {metric.canonicalField}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {lineage ? (
          <div>
            <strong>Coverage & lineage</strong>
            <ul className="executive-list">
              <li>Included records: {lineage.recordsIncluded.length}</li>
              <li>Excluded records: {lineage.recordsExcluded.length}</li>
              <li>
                Source boards: {lineage.sourceBoards.map((board) =>
                  `${board.entity}:${board.boardName ?? board.boardId}`).join(" · ") || "None"}
              </li>
              <li>
                Join path: {lineage.joinPath.length
                  ? lineage.joinPath.map((join) =>
                      `${join.joinId} (${join.matchedKeys}/${join.totalKeys} matched)`).join(" · ")
                  : "No cross-board join required"}
              </li>
              {lineage.metricRecords.map((metric) => (
                <li key={`coverage-${metric.metricId}`}>
                  {metric.metricId}: known {metric.knownValueCount ?? "n/a"} · unknown {metric.unknownValueCount ?? "n/a"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {trace.evidence.dealItemIds.length || trace.evidence.workOrderItemIds.length ? (
        <details className="copilot-progressive-details">
          <summary>Show evidence IDs</summary>
          <ul className="executive-list">
            {trace.evidence.dealItemIds.length
              ? <li>Deal IDs: {trace.evidence.dealItemIds.join(", ")}</li>
              : null}
            {trace.evidence.workOrderItemIds.length
              ? <li>Work Order IDs: {trace.evidence.workOrderItemIds.join(", ")}</li>
              : null}
          </ul>
        </details>
      ) : null}

      {trust?.limitations.length || trace.caveats.length ? (
        <div className="copilot-trust-limitations">
          {[...(trust?.limitations ?? []), ...trace.caveats].map((limitation) => (
            <p key={limitation}>{limitation}</p>
          ))}
        </div>
      ) : null}
    </details>
  );
}

function FollowUps({
  response,
  onPrompt,
}: {
  response: V2UiResponse;
  onPrompt: (prompt: string) => void;
}) {
  const followUps = response.followUps ?? [];
  if (!followUps.length) return null;

  return (
    <section className="answer-section">
      <p className="answer-section-label">Useful next questions</p>
      <div className="choice-row">
        {followUps.slice(0, 4).map((followUp) => (
          <button
            key={`${followUp.label}-${followUp.query}`}
            className="choice-button"
            type="button"
            onClick={() => onPrompt(followUp.query)}
          >
            {followUp.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function FounderCopilotAnswerV2({
  response,
  onPrompt,
}: {
  response: V2UiResponse;
  onPrompt: (prompt: string) => void;
}) {
  const state = stateFor(response);
  const stateMeta = statePresentation(state);
  const presentation = useMemo(() => presentationFor(response), [response]);
  const visualSections = useMemo(
    () => buildVisualAnalytics(response.data, presentation.currencyCode),
    [response.data, presentation.currencyCode],
  );
  const clarificationOptions = useMemo(
    () => clarificationOptionsFor(response),
    [response],
  );

  const hasVisualAnalytics = visualSections.length > 0;
  const compactAnswer =
    response.analysis?.toolsUsed.length === 1 &&
    (response.analysis.toolsUsed[0] === "getReceivables" ||
      response.analysis.toolsUsed[0] === "getPipelineSummary");
  const criticalCaveats = presentation.caveats.filter(isCriticalCaveat);
  const secondaryCaveats = presentation.caveats.filter(
    (caveat) => !criticalCaveats.includes(caveat),
  );
  const showSource =
    state === "SUCCESS" ||
    state === "PARTIAL_DATA" ||
    state === "NO_MATCH";

  return (
    <article className={`assistant-answer assistant-answer-state-${state.toLowerCase()}`}>
      <div className="answer-topline">
        <StatusPill tone={stateMeta.tone}>{stateMeta.label}</StatusPill>
        {response.errorCode ? <span className="error-code">{response.errorCode}</span> : null}
      </div>

      <section className="answer-section">
        <p className="answer-section-label">Answer</p>
        {presentation.headline && state === "SUCCESS"
          ? <h3 className="answer-headline">{presentation.headline}</h3>
          : null}
        <p className="answer-text">{presentation.executiveSummary}</p>
      </section>

      {!hasVisualAnalytics && presentation.metrics.length > 0 ? (
        <section className="answer-section" aria-label="Key metrics">
          <p className="answer-section-label">Key metrics</p>
          <div className="answer-metrics">
            {presentation.metrics.map(({ label, value }) => (
              <div key={`${label}-${String(value)}`}>
                <span>{label}</span>
                <strong className="tabular">
                  {formatMetricValue(label, value, presentation.currencyCode)}
                </strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {hasVisualAnalytics
        ? <CopilotVisualAnalytics sections={visualSections} />
        : null}

      {presentation.structuredLines.length > 0 ? (
        hasVisualAnalytics ? (
          <details className="answer-section copilot-supplied-details">
            <summary>Show supplied result details</summary>
            <ul className="executive-list" aria-label="Authoritative supplied result details">
              {presentation.structuredLines.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </details>
        ) : (
          <section className="answer-section" aria-label="Authoritative structured results">
            <p className="answer-section-label">Supporting breakdown</p>
            <ul className="executive-list">
              {presentation.structuredLines.map((line, index) => (
                <li key={`${index}-${line}`}>{line}</li>
              ))}
            </ul>
          </section>
        )
      ) : null}

      {!compactAnswer && presentation.observations.length > 0 ? (
        <section className="answer-section">
          <p className="answer-section-label">Observations</p>
          <ul className="executive-list">
            {presentation.observations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      {!compactAnswer && presentation.risks.length > 0 ? (
        <section className="answer-section answer-section-risk">
          <p className="answer-section-label">Risks</p>
          <ul className="executive-list">
            {presentation.risks.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      {!compactAnswer && presentation.attentionItems.length > 0 ? (
        <section className="answer-section">
          <p className="answer-section-label">Attention items</p>
          <ul className="executive-list">
            {presentation.attentionItems.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      ) : null}

      <ScenarioTriptych response={response} />

      {response.clarification?.required ? (
        <section className="clarification-card" aria-label="Clarification required">
          <strong>{response.clarification.question}</strong>
          <p>{response.clarification.reason}</p>
          {clarificationOptions.length ? (
            <div className="choice-row">
              {clarificationOptions.map((option) => (
                <button
                  key={option}
                  className="choice-button"
                  type="button"
                  onClick={() => onPrompt(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {criticalCaveats.length > 0 ? (
        <section className="caveat-box">
          <strong>Important caveat</strong>
          <ul>{criticalCaveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
        </section>
      ) : null}

      {secondaryCaveats.length > 0 ? (
        <details className="answer-section copilot-supplied-details">
          <summary>Data quality & caveats</summary>
          <ul className="executive-list">
            {secondaryCaveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
          </ul>
        </details>
      ) : null}

      <TrustTrace response={response} />

      <FollowUps response={response} onPrompt={onPrompt} />

      {showSource ? (
        <footer className="answer-source" aria-label="Answer provenance">
          <span>Source: {response.source.provider}</span>
          <span>
            {presentation.boardLabels.length
              ? `Boards: ${presentation.boardLabels.join(", ")}`
              : "Source boards unavailable"}
          </span>
          {presentation.recordsAnalyzed !== undefined
            ? <span>{formatNumber(presentation.recordsAnalyzed)} records analyzed</span>
            : null}
          <span>Fetched {formatDateTime(response.source.fetchedAt)}</span>
        </footer>
      ) : null}
    </article>
  );
}
