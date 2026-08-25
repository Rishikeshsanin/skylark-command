# Agent 3 — AI Orchestration, API Reliability & Security Design

Status: **Canonical shared contracts and Agent 1 deterministic analytics exports are merged. Agent 3 infrastructure and thin analytics dispatch are implemented.**

This layer consumes Agent 1's canonical types from `src/types`, live loader from `src/lib/business-data`, and deterministic analytics from `src/lib/analytics`. It does not redefine Deal, WorkOrder, AnalyticsResult, ClarificationRequest, AgentResponse, normalization, or business arithmetic.

## Execution flow

```text
Founder question
  -> content-type/body-size validation
  -> per-client rate limit
  -> bounded structured query planner
  -> live monday loader (Agent 1)
  -> canonical deterministic analytics (Agent 1)
  -> canonical AgentResponse composition
  -> optional explanation provider later
```

The LLM is never the source of truth for business arithmetic. All totals, counts, stage/sector breakdowns, revenue, receivables, work-order health, client intelligence and leadership-brief facts come from Agent 1 deterministic analytics.

## Implemented Agent 3 boundaries

- Zod chat request validation with strict unknown-key rejection
- 2,000-character message limit and 8 KiB request-body cap
- JSON content-type enforcement
- bounded deterministic query planner with structured clarification
- strict parser for future model-produced query plans
- canonical `ClarificationRequest` orchestration
- canonical `AgentResponse` composition using actual live source `fetchedAt` metadata
- thin intent dispatcher over Agent 1 exports
- in-memory per-client chat rate limiting (20 requests/minute/instance)
- request IDs returned via `x-request-id`
- controlled public errors with monday-specific safe mappings and no stack traces
- structured logging with secret-key redaction and no question/body logging
- abort-based external-call timeout helper for future AI provider calls
- explicit untrusted-business-data prompt delimiters and system/data separation
- production-safe health endpoint exposing configuration booleans only
- global security headers and disabled `X-Powered-By`

## Prompt-injection boundary

monday.com cells and record text are untrusted data, never instructions. Raw monday GraphQL is not exposed to the model. The explanation helper accepts only normalized/deterministic result objects, serializes them into a bounded untrusted-data block, escapes delimiter collisions, and uses a fixed system instruction that prohibits recalculation or following instructions contained in data.

## Clarification behavior

Ambiguous ranking requests such as `Who are our best customers?` return the canonical clarification contract with options such as won value, active pipeline, project execution, or combined commercial/operational importance. No ranking definition is invented.

If a selected ranking definition is not yet exported by deterministic analytics, the adapter fails closed with `CUSTOMER_RANKING_NOT_WIRED` rather than calculating a ranking in Agent 3.

## Data freshness and time scopes

Quarter analysis uses Agent 1's `dealCloseQuarterMetrics`. A requested current/explicit quarter with no records returns an empty deterministic result plus a caveat naming the latest available quarter when one exists.

Other time-scoped combinations such as sector performance for the current quarter are rejected with `PERIOD_SCOPE_NOT_WIRED` until Agent 1 exposes a canonical scoped metric. Agent 3 does not filter/recalculate those metrics independently.

## Health endpoint

`GET /api/health` returns service status, request ID, timestamp and boolean configuration state. It never returns tokens, API keys, credential text, stack traces, or live monday records and does not make an expensive provider call.

## Rate-limit deployment note

The current limiter is intentionally dependency-light for the hiring prototype. It is process-local, so limits are best-effort across horizontally scaled/serverless instances. The helper is isolated so a distributed backend can replace it without changing route semantics.

## Remaining integration limitation

A concrete external AI explanation provider is intentionally not configured yet. The current API returns canonical deterministic data with a safe generic completion message. When a provider is selected, it should receive only bounded deterministic results through `untrusted-data.ts`, use the timeout helper, validate output, and fall back to the deterministic response on provider failure.
