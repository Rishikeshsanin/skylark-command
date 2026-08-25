"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";
import type { AgentResponse } from "@/types/domain";
import {
  formatAmount,
  formatDateTime,
  formatNumber,
} from "@/components/ui/formatters";
import { StatusPill } from "@/components/ui/status-pill";
import { structuredDataLines } from "@/components/copilot/structured-data";

const CHAT_ENDPOINT = "/api/chat";
const MAX_MESSAGE_CHARS = 2_000;

const suggestions = [
  "How is our pipeline looking?",
  "Which deals need attention?",
  "How is the energy sector performing?",
  "Which work orders are at risk?",
  "Which clients have both active projects and open deals?",
  "Prepare a leadership brief.",
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  prompt?: string;
  response?: AgentResponse;
};

type RetryState = { prompt: string; message: string } | null;
type MetricHighlight = { label: string; value: string | number };

type Presentation = {
  headline?: string;
  executiveSummary: string;
  observations: string[];
  risks: string[];
  attentionItems: string[];
  followUpQuestions: string[];
  caveats: string[];
  metrics: MetricHighlight[];
  structuredLines: string[];
  boardLabels: string[];
  recordsAnalyzed?: number;
  currencyCode?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [item.trim()];
    const itemRecord = asRecord(item);
    const text =
      readString(itemRecord, "reason") ??
      readString(itemRecord, "message") ??
      readString(itemRecord, "title") ??
      readString(itemRecord, "name");
    return text ? [text] : [];
  });
}

function labelize(key: string) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function metricHighlights(dataRecord: Record<string, unknown> | null): MetricHighlight[] {
  const explicit = dataRecord?.metricHighlights;
  if (Array.isArray(explicit)) {
    return explicit.flatMap((item) => {
      const record = asRecord(item);
      const label = readString(record, "label");
      const value = record?.value;
      return label && (typeof value === "number" || typeof value === "string")
        ? [{ label, value }]
        : [];
    }).slice(0, 6);
  }

  const explicitRecord = asRecord(explicit);
  const source = explicitRecord ?? dataRecord;
  if (!source) return [];
  const ignored = new Set([
    "executiveSummary",
    "observations",
    "risks",
    "dataQualityCaveats",
    "metricHighlights",
    "recordsAnalyzed",
    "currencyCode",
    "provenance",
  ]);
  const entries: MetricHighlight[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (ignored.has(key)) continue;
    if (typeof value === "number" || typeof value === "string") {
      entries.push({ label: labelize(key), value });
    }
    if (entries.length === 6) break;
  }
  return entries;
}

function presentationFor(response: AgentResponse): Presentation {
  const responseRecord = asRecord(response);
  const dataRecord = asRecord(response.data);
  const sourceRecord = asRecord(response.source);
  const provenanceRecord = asRecord(dataRecord?.provenance);
  const explanation = response.explanation;
  const currencyCode =
    readString(sourceRecord, "currencyCode") ??
    readString(dataRecord, "currencyCode") ??
    readString(responseRecord, "currencyCode");
  const recordsAnalyzed =
    readNumber(sourceRecord, "recordsAnalyzed") ??
    readNumber(dataRecord, "recordsAnalyzed") ??
    readNumber(provenanceRecord, "totalRecordsAnalyzed") ??
    readNumber(responseRecord, "recordsAnalyzed");
  const boardNames = readStringArray(sourceRecord, "boardNames");
  const boardLabels = boardNames.length ? boardNames : response.source.boardIds;
  const observations = explanation?.observations ?? [
    ...readStringArray(responseRecord, "observations"),
    ...readStringArray(dataRecord, "observations"),
  ];
  const risks = explanation?.risks ?? [
    ...readStringArray(responseRecord, "risks"),
    ...readStringArray(dataRecord, "risks"),
  ];
  const dataQualityCaveats = [
    ...readStringArray(responseRecord, "dataQualityCaveats"),
    ...readStringArray(dataRecord, "dataQualityCaveats"),
  ];

  return {
    headline: explanation?.headline,
    executiveSummary:
      explanation?.executiveSummary ??
      readString(responseRecord, "executiveSummary") ??
      readString(dataRecord, "executiveSummary") ??
      response.answer,
    observations: [...new Set(observations)],
    risks: [...new Set(risks)],
    attentionItems: explanation?.attentionItems ?? [],
    followUpQuestions: explanation?.followUpQuestions ?? [],
    caveats: [...new Set([...(response.caveats ?? []), ...dataQualityCaveats])],
    metrics: metricHighlights(dataRecord),
    structuredLines: structuredDataLines(response.data, currencyCode),
    boardLabels,
    recordsAnalyzed,
    currencyCode,
  };
}

function formatMetricValue(label: string, value: string | number, currencyCode?: string) {
  if (typeof value !== "number") return value;
  const looksMonetary = /value|amount|receivable|pipeline|revenue|billing|collected|cash|won|exposure/i.test(label);
  return looksMonetary && currencyCode
    ? formatAmount(value, currencyCode)
    : formatNumber(value);
}

function AssistantResponse({
  response,
  onPrompt,
}: {
  response: AgentResponse;
  onPrompt: (prompt: string) => void;
}) {
  const presentation = presentationFor(response);
  const isClarification = Boolean(response.clarification?.required);

  return (
    <article className="assistant-answer">
      <div className="answer-topline">
        <StatusPill tone={response.ok ? "positive" : "critical"}>
          {isClarification ? "Clarification needed" : response.ok ? "Grounded answer" : "Controlled error"}
        </StatusPill>
        {response.errorCode ? <span className="error-code">{response.errorCode}</span> : null}
      </div>

      <section className="answer-section">
        <p className="answer-section-label">Executive summary</p>
        {presentation.headline ? <h3 className="answer-headline">{presentation.headline}</h3> : null}
        <p className="answer-text">{presentation.executiveSummary}</p>
      </section>

      {presentation.metrics.length > 0 ? (
        <section className="answer-section" aria-label="Metric highlights">
          <p className="answer-section-label">Metric highlights</p>
          <div className="answer-metrics">
            {presentation.metrics.map(({ label, value }) => (
              <div key={`${label}-${String(value)}`}>
                <span>{label}</span>
                <strong className="tabular">{formatMetricValue(label, value, presentation.currencyCode)}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {presentation.structuredLines.length > 0 ? (
        <section className="answer-section" aria-label="Authoritative structured results">
          <p className="answer-section-label">Structured results</p>
          <ul className="executive-list">
            {presentation.structuredLines.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {presentation.observations.length > 0 ? (
        <section className="answer-section">
          <p className="answer-section-label">Observations</p>
          <ul className="executive-list">{presentation.observations.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}

      {presentation.risks.length > 0 ? (
        <section className="answer-section answer-section-risk">
          <p className="answer-section-label">Risks</p>
          <ul className="executive-list">{presentation.risks.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}

      {presentation.attentionItems.length > 0 ? (
        <section className="answer-section">
          <p className="answer-section-label">Attention items</p>
          <ul className="executive-list">{presentation.attentionItems.map((item) => <li key={item}>{item}</li>)}</ul>
        </section>
      ) : null}

      {response.clarification?.required ? (
        <section className="clarification-card" aria-label="Clarification required">
          <strong>{response.clarification.question}</strong>
          <p>{response.clarification.reason}</p>
          {response.clarification.options?.length ? (
            <div className="choice-row">
              {response.clarification.options.map((option) => (
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

      {presentation.caveats.length > 0 ? (
        <section className="caveat-box">
          <strong>Data quality & caveats</strong>
          <ul>{presentation.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
        </section>
      ) : null}

      {presentation.followUpQuestions.length > 0 ? (
        <section className="answer-section">
          <p className="answer-section-label">Follow-up questions</p>
          <div className="choice-row">
            {presentation.followUpQuestions.slice(0, 4).map((question) => (
              <button key={question} className="choice-button" type="button" onClick={() => onPrompt(question)}>
                {question}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="answer-source" aria-label="Answer provenance">
        <span>Source: {response.source.provider}</span>
        <span>{presentation.boardLabels.length ? `Boards: ${presentation.boardLabels.join(", ")}` : "Source boards unavailable"}</span>
        {presentation.recordsAnalyzed !== undefined ? <span>{formatNumber(presentation.recordsAnalyzed)} records analyzed</span> : null}
        <span>Fetched {formatDateTime(response.source.fetchedAt)}</span>
      </footer>
    </article>
  );
}

export function FounderCopilot() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryState, setRetryState] = useState<RetryState>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasConversation = messages.length > 0;
  const canSubmit = query.trim().length > 0 && !loading;
  const liveRegion = loading ? "Analyzing live business data" : retryState?.message ?? "";

  async function submitPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    setRetryState(null);
    setLoading(true);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", prompt: trimmed }]);
    setQuery("");

    try {
      const request = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("Founder Copilot received an incompatible server response.");
      }

      const body = (await request.json()) as AgentResponse;
      if (!body || typeof body.answer !== "string" || !body.source) {
        throw new Error("Founder Copilot received an invalid AgentResponse envelope.");
      }

      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", response: body }]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Founder Copilot is temporarily unavailable.";
      setRetryState({ prompt: trimmed, message });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitPrompt(query);
  }

  return (
    <div className="copilot-layout">
      <div className="sr-only" aria-live="polite" aria-atomic="true">{liveRegion}</div>

      {!hasConversation ? (
        <section className="copilot-welcome">
          <span className="copilot-badge">Founder Copilot</span>
          <h2>Ask the business, not the spreadsheet.</h2>
          <p>Questions are sent only to the canonical server-side <code>POST /api/chat</code> endpoint. Responses remain source-aware, caveated, and auditable.</p>
          <div className="suggestion-grid">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); inputRef.current?.focus(); }}>
                {suggestion}<span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {hasConversation ? (
        <section className="chat-thread" aria-label="Conversation history">
          {messages.map((message) => message.role === "user" ? (
            <div className="user-message" key={message.id}><span>You</span><p>{message.prompt}</p></div>
          ) : message.response ? (
            <div className="assistant-message" key={message.id}>
              <span>Skylark Command</span>
              <AssistantResponse response={message.response} onPrompt={(prompt) => void submitPrompt(prompt)} />
            </div>
          ) : null)}

          {loading ? (
            <div className="assistant-message"><span>Skylark Command</span><div className="thinking-card" role="status"><i /><i /><i /><p>Analyzing live data…</p></div></div>
          ) : null}

          {retryState ? (
            <div className="copilot-error" role="alert">
              <div><strong>Couldn’t complete that request</strong><p>{retryState.message}</p></div>
              <div className="error-actions">
                <button className="button button-secondary" type="button" onClick={() => void submitPrompt(retryState.prompt)}>Retry</button>
                <button className="button button-secondary" type="button" onClick={() => setRetryState(null)}>Dismiss</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <form className="copilot-composer" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="founder-question">Ask Founder Copilot</label>
        <textarea
          id="founder-question"
          ref={inputRef}
          value={query}
          maxLength={MAX_MESSAGE_CHARS}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setQuery(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSubmit) void submitPrompt(query);
            }
          }}
          placeholder="Ask about pipeline, operations, clients, receivables, data health…"
          rows={3}
        />
        <div className="composer-footer">
          <span>{formatNumber(query.length)} / {formatNumber(MAX_MESSAGE_CHARS)} · Enter to send · Shift+Enter for new line</span>
          <button className="button button-primary" type="submit" disabled={!canSubmit}>{loading ? "Analyzing…" : "Ask Copilot"}</button>
        </div>
      </form>
    </div>
  );
}
