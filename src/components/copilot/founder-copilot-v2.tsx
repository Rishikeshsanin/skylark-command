"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";
import type { AgentResponse } from "@/types";
import { AssistantResponse } from "@/components/copilot/founder-copilot";
import { structuredDataLines } from "@/components/copilot/structured-data";
import type {
  AnalysisTrustTrace,
  ConversationContext,
} from "@/lib/agent/v2/contracts";

const CHAT_ENDPOINT = "/api/chat";
const MAX_MESSAGE_CHARS = 2_000;

const suggestions = [
  "Which sector has the largest open opportunity?",
  "How is our pipeline looking?",
  "What are our receivables?",
  "Which projects need leadership attention?",
  "Show pipeline by stage.",
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  prompt?: string;
  response?: AgentResponse;
};

type V2Response = AgentResponse & { analysis?: AnalysisTrustTrace };
type RetryState = { prompt: string; message: string } | null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function formatFilter(trace: AnalysisTrustTrace["filters"][number]): string {
  const value = Array.isArray(trace.value) ? trace.value.join(", ") : String(trace.value);
  return `${trace.field} ${trace.operator} ${value}`;
}

function TrustTrace({ response }: { response: V2Response }) {
  const trace = response.analysis;
  if (!trace) return null;
  return (
    <details className="answer-section copilot-supplied-details">
      <summary>Analysis evidence & provenance</summary>
      <ul className="executive-list">
        <li>Planner: {trace.planner}</li>
        <li>Tools used: {trace.toolsUsed.length ? trace.toolsUsed.join(" → ") : "None — clarification only"}</li>
        <li>Semantic metrics: {trace.semanticMetricIds.length ? trace.semanticMetricIds.join(", ") : "None"}</li>
        <li>Filters: {trace.filters.length ? trace.filters.map(formatFilter).join(" · ") : "None"}</li>
        <li>Source snapshot: {trace.sourceSnapshot?.id ?? "Not loaded for this response"}</li>
        <li>Evidence rows: {trace.evidence.dealCount} Deals · {trace.evidence.workOrderCount} Work Orders</li>
        {trace.semanticTrust ? <li>Evidence quality: {trace.semanticTrust.evidenceQuality.status} · semantic policy {trace.semanticTrust.evidenceQuality.policyVersion}</li> : null}
        {trace.semanticTrust ? <li>Metric definitions: {trace.semanticTrust.metrics.map((metric) => `${metric.id}@${metric.semanticVersion}`).join(", ")}</li> : null}
        {trace.scenarioTrust ? <li>Scenario evidence quality: BASELINE {trace.scenarioTrust.baseline.evidenceQuality.status} · SCENARIO {trace.scenarioTrust.scenario.evidenceQuality.status}</li> : null}
        {trace.evidence.dealItemIds.length ? <li>Deal evidence IDs: {trace.evidence.dealItemIds.slice(0, 8).join(", ")}{trace.evidence.dealItemIds.length > 8 ? " …" : ""}</li> : null}
        {trace.evidence.workOrderItemIds.length ? <li>Work Order evidence IDs: {trace.evidence.workOrderItemIds.slice(0, 8).join(", ")}{trace.evidence.workOrderItemIds.length > 8 ? " …" : ""}</li> : null}
        {trace.semanticTrust?.limitations.map((limitation) => <li key={`semantic-${limitation}`}>Trust limitation: {limitation}</li>)}
        {trace.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
      </ul>
    </details>
  );
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
                {lines.length ? lines.map((line) => <li key={line}>{line}</li>) : <li>No numeric change in this view.</li>}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="answer-text">Scenario values are hypothetical and never written back to monday.com.</p>
    </section>
  );
}

export function FounderCopilotV2() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState("");
  const [context, setContext] = useState<ConversationContext | undefined>();
  const [loading, setLoading] = useState(false);
  const [retryState, setRetryState] = useState<RetryState>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const canSubmit = query.trim().length > 0 && !loading;

  async function submitPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setRetryState(null);
    setQuery("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", prompt: trimmed }]);

    try {
      const request = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, ...(context ? { context } : {}) }),
      });
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) throw new Error("Founder Copilot received an incompatible server response.");
      const body = await request.json() as V2Response;
      if (!body || typeof body.answer !== "string" || !body.source) throw new Error("Founder Copilot received an invalid response envelope.");
      if (!request.ok && !body.errorCode) throw new Error(body.answer || "Founder Copilot request failed.");
      if (body.analysis?.context) setContext(body.analysis.context);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", response: body }]);
    } catch (error) {
      setRetryState({
        prompt: trimmed,
        message: error instanceof Error ? error.message : "Founder Copilot is temporarily unavailable.",
      });
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
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {loading ? "Analyzing live business data" : retryState?.message ?? ""}
      </div>

      {messages.length === 0 ? (
        <section className="copilot-welcome">
          <span className="copilot-badge">Founder Copilot 2.0</span>
          <h2>Ask, drill down, compare, and simulate — without giving AI the calculator.</h2>
          <p>The planner may interpret your question, but only allowlisted deterministic analytics can produce business numbers. Follow-ups carry structured metric, entity, period, filter, and previous-result context.</p>
          <div className="suggestion-grid">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); inputRef.current?.focus(); }}>
                {suggestion}<span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {messages.length > 0 ? (
        <section className="chat-thread" aria-label="Conversation history">
          {messages.map((message) => message.role === "user" ? (
            <div className="user-message" key={message.id}><span>You</span><p>{message.prompt}</p></div>
          ) : message.response ? (
            <div className="assistant-message" key={message.id}>
              <span>Skylark Command</span>
              <AssistantResponse response={message.response} onPrompt={(prompt) => void submitPrompt(prompt)} />
              <ScenarioTriptych response={message.response} />
              <TrustTrace response={message.response as V2Response} />
            </div>
          ) : null)}

          {loading ? (
            <div className="assistant-message"><span>Skylark Command</span><div className="thinking-card" role="status"><i /><i /><i /><p>Planning approved analytics…</p></div></div>
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
          placeholder="Ask a business question, then follow with Why?, filter it, compare a period, or run a grounded what-if…"
          rows={3}
        />
        <div className="composer-footer">
          <span>{query.length} / {MAX_MESSAGE_CHARS} · Structured context {context ? "active" : "starts after the first result"}</span>
          <button className="button button-primary" type="submit" disabled={!canSubmit}>{loading ? "Analyzing…" : "Ask Copilot"}</button>
        </div>
      </form>
    </div>
  );
}
