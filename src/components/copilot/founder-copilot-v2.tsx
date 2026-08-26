"use client";

import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ConversationContext } from "@/lib/agent/v2/contracts";
import { loadingLabelFor } from "@/lib/agent/v2/conversation-routing";
import {
  FounderCopilotAnswerV2,
  type V2UiResponse,
} from "@/components/copilot/founder-copilot-answer-v2";

const CHAT_ENDPOINT = "/api/chat";
const MAX_MESSAGE_CHARS = 2_000;
const COMPOSER_MIN_HEIGHT = 54;
const COMPOSER_MAX_HEIGHT = 160;
const NEAR_BOTTOM_PX = 120;

const suggestions = [
  "Which sector has the largest open opportunity?",
  "How is our pipeline looking?",
  "What are our receivables?",
  "Show Work Order health.",
  "Show pipeline by stage.",
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  prompt?: string;
  response?: V2UiResponse;
};

type RetryState = { prompt: string; message: string } | null;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function resizeComposer(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  const nextHeight = Math.min(
    Math.max(textarea.scrollHeight, COMPOSER_MIN_HEIGHT),
    COMPOSER_MAX_HEIGHT,
  );
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY =
    textarea.scrollHeight > COMPOSER_MAX_HEIGHT ? "auto" : "hidden";
}

export function FounderCopilotV2() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState("");
  const [context, setContext] = useState<ConversationContext | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Analyzing business data…");
  const [retryState, setRetryState] = useState<RetryState>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const threadRef = useRef<HTMLElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);

  const canSubmit = query.trim().length > 0 && !loading;

  const scrollToLatest = useCallback((force = false) => {
    if (!force && !nearBottomRef.current) {
      setShowJumpToLatest(true);
      return;
    }
    bottomRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "end",
    });
    nearBottomRef.current = true;
    setShowJumpToLatest(false);
  }, []);

  useEffect(() => {
    resizeComposer(inputRef.current);
  }, [query]);

  useEffect(() => {
    if (!messages.length && !loading) return;
    const frame = requestAnimationFrame(() => scrollToLatest(false));
    return () => cancelAnimationFrame(frame);
  }, [loading, messages, scrollToLatest]);

  function handleThreadScroll() {
    const thread = threadRef.current;
    if (!thread) return;
    const distanceFromBottom =
      thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    const isNearBottom = distanceFromBottom <= NEAR_BOTTOM_PX;
    nearBottomRef.current = isNearBottom;
    setShowJumpToLatest(!isNearBottom);
  }

  async function submitPrompt(prompt: string) {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    const shouldFollowLatest = nearBottomRef.current;
    setLoading(true);
    setLoadingLabel(loadingLabelFor(trimmed));
    setRetryState(null);
    setQuery("");
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", prompt: trimmed },
    ]);

    if (shouldFollowLatest) {
      nearBottomRef.current = true;
    }

    try {
      const request = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          ...(context ? { context } : {}),
        }),
      });
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("Founder Copilot received an incompatible server response.");
      }

      const body = await request.json() as V2UiResponse;
      if (!body || typeof body.answer !== "string" || !body.source) {
        throw new Error("Founder Copilot received an invalid response envelope.");
      }
      if (!request.ok && !body.errorCode) {
        throw new Error(body.answer || "Founder Copilot request failed.");
      }

      if (body.analysis?.context) setContext(body.analysis.context);
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", response: body },
      ]);
    } catch (error) {
      setRetryState({
        prompt: trimmed,
        message:
          error instanceof Error
            ? error.message
            : "Founder Copilot is temporarily unavailable.",
      });
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        resizeComposer(inputRef.current);
        inputRef.current?.focus();
      });
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitPrompt(query);
  }

  return (
    <div className="copilot-layout copilot-quality-layout">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {loading ? loadingLabel : retryState?.message ?? ""}
      </div>

      {messages.length === 0 ? (
        <section className="copilot-welcome">
          <span className="copilot-badge">Founder Copilot 2.0</span>
          <h2>Ask Skylark a business question.</h2>
          <p>
            Business numbers come only from approved deterministic analytics.
            The AI layer may interpret or explain results, but it never becomes
            the calculator or writes back to monday.com.
          </p>
          <div className="suggestion-grid">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={loading}
                onClick={() => void submitPrompt(suggestion)}
              >
                {suggestion}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {messages.length > 0 ? (
        <div className="copilot-thread-shell">
          <section
            ref={threadRef}
            className="chat-thread copilot-scroll-thread"
            aria-label="Conversation history"
            onScroll={handleThreadScroll}
          >
            {messages.map((message) =>
              message.role === "user" ? (
                <div className="user-message" key={message.id}>
                  <span>You</span>
                  <p>{message.prompt}</p>
                </div>
              ) : message.response ? (
                <div className="assistant-message" key={message.id}>
                  <span>Skylark Command</span>
                  <FounderCopilotAnswerV2
                    response={message.response}
                    onPrompt={(prompt) => void submitPrompt(prompt)}
                  />
                </div>
              ) : null,
            )}

            {loading ? (
              <div className="assistant-message">
                <span>Skylark Command</span>
                <div className="thinking-card" role="status">
                  <i />
                  <i />
                  <i />
                  <p>{loadingLabel}</p>
                </div>
              </div>
            ) : null}

            {retryState ? (
              <div className="copilot-error" role="alert">
                <div>
                  <strong>Couldn’t complete that request</strong>
                  <p>{retryState.message}</p>
                </div>
                <div className="error-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void submitPrompt(retryState.prompt)}
                  >
                    Retry
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setRetryState(null)}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : null}

            <div
              ref={bottomRef}
              className="copilot-bottom-anchor"
              aria-hidden="true"
            />
          </section>

          {showJumpToLatest ? (
            <button
              className="jump-to-latest"
              type="button"
              onClick={() => scrollToLatest(true)}
            >
              Jump to latest ↓
            </button>
          ) : null}
        </div>
      ) : null}

      <form className="copilot-composer copilot-quality-composer" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="founder-question">
          Ask Founder Copilot
        </label>
        <textarea
          id="founder-question"
          ref={inputRef}
          value={query}
          maxLength={MAX_MESSAGE_CHARS}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            setQuery(event.target.value);
            resizeComposer(event.currentTarget);
          }}
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canSubmit) void submitPrompt(query);
            }
          }}
          placeholder="Ask about pipeline, customers, Work Orders, receivables, or a grounded what-if…"
          rows={1}
          disabled={loading}
        />
        <div className="composer-footer">
          <span>
            Enter to send · Shift+Enter for new line · {query.length}/{MAX_MESSAGE_CHARS}
          </span>
          <button
            className="button button-primary copilot-send-button"
            type="submit"
            disabled={!canSubmit}
            aria-label={loading ? "Founder Copilot is analyzing" : "Send message"}
          >
            {loading ? "Analyzing…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
