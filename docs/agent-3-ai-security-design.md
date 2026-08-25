# Agent 3 — AI Orchestration, API Reliability & Security Design

Status: **STARTUP GATE BLOCKED — waiting for Agent 1 canonical shared contracts and deterministic analytics exports.**

This document intentionally defines integration boundaries and behavior, not duplicate business/domain models.

## Core execution flow

```text
Founder question
  -> validate request
  -> enforce rate/message limits
  -> query planner / intent extraction
  -> canonical deterministic analytics (Agent 1)
  -> executive response composer
  -> optional LLM explanation
  -> structured API response
```

The LLM must never be the source of truth for business arithmetic. All totals, counts, stage/sector breakdowns, date filtering, revenue, receivables and cross-board metrics must come from Agent 1 deterministic analytics.

## Planner responsibilities

The planner should map natural language to a small, typed intent + filters representation that can be dispatched to Agent 1 analytics. Intended capabilities, only when the matching deterministic analytics exist:

- pipeline overview
- pipeline by sector
- pipeline by stage
- won value / revenue
- deal prioritization
- quarter/date analysis
- work-order health
- billing / receivables
- client cross-board analysis
- data-health questions
- leadership brief
- general business overview

The planner should prefer deterministic keyword/rule handling for obvious requests and use an LLM only for bounded structured classification when needed. Model output must be schema-validated before dispatch.

## Ambiguity behavior

Do not invent business definitions.

Example: `Who are our best customers?` should return structured clarification options such as:

- highest won value
- largest active pipeline
- best project execution
- combined commercial + operational importance

For questions such as `How is the pipeline?`, use a documented default scope only when safe; otherwise request a concise clarification.

## Data freshness behavior

Requested time periods must be evaluated against available normalized records. If a period has no matching records, return an explicit empty-period response and, when possible, identify the latest available deterministic period. Never manufacture present-quarter results.

## Prompt-injection boundary

monday.com cell values are untrusted data, never instructions.

Only normalized/aggregated deterministic results should be sent to the LLM explanation layer. The model must not receive a broad monday tool, raw arbitrary GraphQL capability, mutation capability, `eval`, or dynamic code execution.

Any textual record excerpts passed to a model must be wrapped/labeled as untrusted business data and separated from system/developer instructions.

## API reliability design

Planned server-side controls:

- Zod request validation
- JSON/content-type validation for POST APIs
- strict maximum message length
- request IDs on responses and logs
- controlled public error envelope
- no stack traces or secrets returned to clients
- external-call timeouts via `AbortSignal.timeout` or equivalent
- retry only safe transient provider failures with bounded backoff
- explicit handling for provider 429/5xx/timeouts/malformed output
- deterministic fallback response when AI explanation is unavailable
- empty analytics result handling
- unknown-intent handling
- no monday mutation paths

## Rate limiting

Use a lightweight server-side limiter suitable for the public hiring prototype. The initial implementation should be dependency-light and isolate the limiter behind a helper so it can later move to a distributed store if deployment topology requires it.

Limits should apply per client identifier and route, with stricter limits on AI-backed endpoints than deterministic health/read endpoints.

## Structured response goals

Adapt to Agent 1 canonical types once available. UI-facing responses should support the following concepts without duplicating Agent 1 models:

- response type
- headline
- summary
- deterministic metrics
- observations
- risks / attention items
- data quality notes
- sources / boards used
- clarification options
- retrieved-at timestamp
- request ID
- AI explanation availability/fallback state

## Leadership Brief orchestration

The backend should compose a leadership brief from deterministic analytics sections only:

1. Executive Summary
2. Pipeline
3. Sales
4. Operations
5. Receivables
6. Attention Required
7. Data Quality

Missing sections must be omitted or marked unavailable rather than guessed.

## Health endpoint

Planned `GET /api/health` behavior:

- return service status, build/runtime-safe metadata and request ID
- never expose credentials or secret values
- optionally report dependency configuration as booleans only
- avoid turning health into an expensive live-provider call by default

## Test plan

Once foundation contracts are available, add tests for:

- valid request parsing
- oversized messages
- wrong content type
- unknown intent
- clarification behavior
- empty analytics results
- unavailable requested period
- malformed model output
- provider timeout/429/5xx
- prompt-injection-like text treated as data
- controlled error shape
- request ID presence
- rate-limit behavior
- deterministic fallback when AI is unavailable
- health endpoint secret safety

Then run lint, tests, and production build.

## MASTER CONTRACT REQUEST

Agent 3 needs the following canonical Agent 1 exports before implementation can safely proceed:

1. **Normalized entity types** for deals and work orders, including canonical field names and nullability.
2. **Deterministic analytics function/export surface** available to server code, with input filters and output shapes for each supported metric/analysis.
3. **Canonical date/period semantics**, including quarter representation, latest-available-period behavior, and how invalid/missing dates are represented.
4. **Data-quality result shape**, including missing/invalid field counts or warnings that may be shown to leadership.
5. **Cross-board client identity semantics**, including how client names/IDs are normalized and matched between deals and work orders.
6. **Source/freshness metadata**, including retrieval timestamp and board/source identifiers if exposed by the foundation.
7. **Error conventions** for monday fetch/normalization/analytics failures so the API layer can convert them to controlled public error responses without leaking internals.

These contracts are required to prevent Agent 3 from creating incompatible duplicate domain types or reimplementing analytics owned by Agent 1.
