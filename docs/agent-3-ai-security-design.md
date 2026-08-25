# Agent 3 — AI Orchestration, API Reliability & Security Design

Status: **Canonical shared contracts merged. Agent 3 infrastructure is implemented; deterministic analytics dispatch remains intentionally unwired until Agent 1 exports analytics functions.**

This layer consumes Agent 1's canonical types from `src/types` and does not redefine Deal, WorkOrder, AnalyticsResult, ClarificationRequest, or AgentResponse.

## Execution flow

```text
Founder question
  -> content-type/body-size validation
  -> per-client rate limit
  -> bounded structured query planner
  -> canonical deterministic analytics adapter (Agent 1 export; pending)
  -> canonical AgentResponse composition
  -> optional explanation provider later
```

The LLM is never the source of truth for business arithmetic. All totals, counts, stage/sector breakdowns, date filtering, revenue, receivables and cross-board metrics must come from Agent 1 deterministic analytics.

## Implemented Agent 3 boundaries

- Zod chat request validation with strict unknown-key rejection
- 2,000-character message limit and 8 KiB request-body cap
- JSON content-type enforcement
- bounded deterministic query planner with structured clarification
- strict parser for future model-produced query plans
- canonical `ClarificationRequest` orchestration
- canonical `AgentResponse` composition
- in-memory per-client chat rate limiting (20 requests/minute/instance)
- request IDs returned via `x-request-id`
- controlled public errors with no stack traces
- structured logging with secret-key redaction and no question/body logging
- abort-based external-call timeout helper
- explicit untrusted-business-data prompt delimiters and system/data separation
- production-safe health endpoint exposing configuration booleans only
- global security headers and disabled `X-Powered-By`

## Prompt-injection boundary

monday.com cells and record text are untrusted data, never instructions. Raw monday GraphQL is not exposed to the model. The explanation helper accepts only already-normalized/deterministic result objects, serializes them into a bounded untrusted-data block, escapes delimiter collisions, and uses a fixed system instruction that prohibits recalculation or following instructions contained in data.

## Clarification behavior

Ambiguous ranking requests such as `Who are our best customers?` return the canonical clarification contract with options such as won value, active pipeline, project execution, or combined commercial/operational importance. No ranking definition is invented.

Unknown intent also returns a concise clarification rather than handing arbitrary prose to unrestricted tools.

## Reliability behavior

The chat route uses canonical responses even when analytics are not yet wired. Known analytics intents currently fail closed with `ANALYTICS_NOT_WIRED` (HTTP 503) rather than fabricating a result. Clarification-only requests can complete without touching analytics.

External providers should be called through the abort-based timeout helper. Provider 429/5xx handling will be added at the concrete provider adapter once a provider is selected; deterministic analytics must remain usable without an explanation provider.

## Health endpoint

`GET /api/health` returns service status, request ID, timestamp and boolean configuration state. It never returns tokens, API keys, credential text, stack traces, or live monday records and does not make an expensive provider call.

## Rate-limit deployment note

The current limiter is intentionally dependency-light for the hiring prototype. It is process-local, so limits are best-effort across horizontally scaled/serverless instances. The helper is isolated so a distributed backend can replace it without changing route semantics.

## Remaining Agent 1 contract request

Agent 3 still needs only the exported deterministic analytics function surface (and any accompanying canonical filter/date semantics) to wire `src/lib/agent/analytics-adapter.ts`. No analytics implementation will be duplicated in Agent 3.
