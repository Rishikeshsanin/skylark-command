"use client";

import { type ChangeEvent, type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import type { AgentResponse } from "@/types/domain";
import { formatDateTime, formatNumber } from "@/components/ui/formatters";
import { StatusPill } from "@/components/ui/status-pill";

type ChatMessage = { id: string; role: "user" | "assistant"; prompt?: string; response?: AgentResponse };
const suggestions = ["How is our pipeline looking?", "Which deals need attention?", "How is the energy sector performing?", "Which work orders are at risk?", "Which clients have both active projects and open deals?", "Prepare a leadership brief."];

function metricEntries(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>).filter(([, value]) => typeof value === "number" || typeof value === "string").slice(0, 6);
}
function labelize(key: string) { return key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^./, (char) => char.toUpperCase()); }

function AssistantResponse({ response, onChoice }: { response: AgentResponse; onChoice: (choice: string) => void }) {
  const metrics = metricEntries(response.data);
  return (
    <article className="assistant-answer">
      <div className="answer-topline"><StatusPill tone={response.ok ? "positive" : "critical"}>{response.ok ? "Grounded answer" : "Request failed"}</StatusPill>{response.errorCode && <span className="error-code">{response.errorCode}</span>}</div>
      <p className="answer-text">{response.answer}</p>
      {metrics.length > 0 && <div className="answer-metrics">{metrics.map(([key, value]) => <div key={key}><span>{labelize(key)}</span><strong className="tabular">{typeof value === "number" ? formatNumber(value) : value}</strong></div>)}</div>}
      {response.clarification?.required && <div className="clarification-card"><strong>{response.clarification.question}</strong><p>{response.clarification.reason}</p><div className="choice-row">{response.clarification.options?.map((option) => <button key={option} className="choice-button" type="button" onClick={() => onChoice(option)}>{option}</button>)}</div></div>}
      {response.caveats.length > 0 && <div className="caveat-box"><strong>Data quality & caveats</strong><ul>{response.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul></div>}
      <footer className="answer-source"><span>Source: {response.source.provider}</span><span>{response.source.boardIds.length ? `${response.source.boardIds.length} source board${response.source.boardIds.length === 1 ? "" : "s"}` : "Source boards unavailable"}</span><span>Retrieved {formatDateTime(response.source.fetchedAt)}</span></footer>
    </article>
  );
}

export function FounderCopilot({ endpoint = "/api/copilot" }: { endpoint?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasConversation = messages.length > 0;
  const canSubmit = query.trim().length > 0 && !loading;
  const liveRegion = loading ? "Analyzing live business data" : error ?? "";

  async function submitPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;
    setError(null); setLoading(true);
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", prompt: trimmed };
    setMessages((current) => [...current, userMessage]); setQuery("");
    try {
      const request = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: trimmed }) });
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) throw new Error("Founder Copilot is not connected to a compatible API response yet.");
      const body = (await request.json()) as AgentResponse;
      if (!request.ok && !body.answer) throw new Error("The Copilot service returned an unsuccessful response.");
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", response: body }]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Founder Copilot is not available yet.";
      setError(message);
    } finally { setLoading(false); inputRef.current?.focus(); }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await submitPrompt(query); }

  return (
    <div className="copilot-layout">
      <div className="sr-only" aria-live="polite">{liveRegion}</div>
      {!hasConversation && <section className="copilot-welcome"><span className="copilot-badge">Founder Copilot</span><h2>Ask the business, not the spreadsheet.</h2><p>Questions are sent to the server-side Copilot endpoint. Answers are expected to return the canonical AgentResponse envelope with provenance and caveats.</p><div className="suggestion-grid">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); inputRef.current?.focus(); }}>{suggestion}<span aria-hidden="true">↗</span></button>)}</div></section>}
      {hasConversation && <section className="chat-thread" aria-label="Conversation history">{messages.map((message) => message.role === "user" ? <div className="user-message" key={message.id}><span>You</span><p>{message.prompt}</p></div> : message.response ? <div className="assistant-message" key={message.id}><span>Skylark Command</span><AssistantResponse response={message.response} onChoice={(choice) => { void submitPrompt(choice); }} /></div> : null)}{loading && <div className="assistant-message"><span>Skylark Command</span><div className="thinking-card" role="status"><i /><i /><i /><p>Analyzing live data…</p></div></div>}{error && <div className="copilot-error" role="alert"><div><strong>Couldn’t complete that request</strong><p>{error}</p></div><button className="button button-secondary" type="button" onClick={() => setError(null)}>Dismiss</button></div>}</section>}
      <form className="copilot-composer" onSubmit={onSubmit}><label className="sr-only" htmlFor="founder-question">Ask Founder Copilot</label><textarea id="founder-question" ref={inputRef} value={query} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setQuery(event.target.value)} onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (canSubmit) void submitPrompt(query); } }} placeholder="Ask about pipeline, revenue, operations, clients, receivables…" rows={3} /><div className="composer-footer"><span>Enter to send · Shift+Enter for a new line</span><button className="button button-primary" type="submit" disabled={!canSubmit}>{loading ? "Analyzing…" : "Ask Copilot"}</button></div></form>
    </div>
  );
}
