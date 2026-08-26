# Skylark Command V2 Observability

Skylark Command uses lightweight structured JSON events written to the server log stream. No external observability vendor is required by the application.

## Logging contract

Events can include `timestamp`, `level`, `event`, `requestId`, `route`, `workspaceKey`, `syncId`, `operation`, `durationMs`, `toolName`/selected tools, `provider`, `resultStatus`, `errorCategory`, record counts, watermark and freshness state.

The logger redacts secret-like keys and configured values for `MONDAY_API_TOKEN`, `DATABASE_URL`, `CRON_SECRET`, `GEMINI_API_KEY`, and `AI_API_KEY`. Authorization/cookie/token/credential fields are always redacted. Full Copilot prompts and raw source records are intentionally not logged.

## Error taxonomy

Operational errors are normalized to: `VALIDATION`, `AUTHORIZATION`, `UPSTREAM_MONDAY`, `DATABASE`, `AI_PROVIDER`, `TIMEOUT`, `ANALYTICS`, `SYNC`, `INTERNAL`.

Public API errors remain deliberately less detailed than server telemetry.

## Request and latency signals

`/api/chat`, `/api/health`, protected sync and diagnostics preserve a safe inbound `x-request-id` or create a UUID. The request context propagates to nested log events through Node AsyncLocalStorage.

Useful operation events include monday fetch, normalization, business-data load, Postgres reads/writes, snapshot enumeration, sync lifecycle, Gemini planning/explanation, and the overall chat request. Copilot completion events expose selected deterministic tool IDs and outcome categories without prompt text.

## Sync and freshness

Temporal sync lifecycle events expose start/success/failure, duration, records fetched/normalized/persisted, source watermark and freshness. The public health endpoint exposes only safe configuration/mode status. `/api/internal/diagnostics` is protected by `CRON_SECRET` and can probe Postgres plus temporal freshness.

## Alert foundation

`evaluateAlertConditions` defines conservative starting conditions for:

- 3 consecutive sync failures
- snapshot age beyond the configured stale threshold
- 3 database failures in an observation window
- AI provider failure rate >= 20% once at least 10 calls exist
- API 5xx rate >= 5% once at least 20 requests exist

These conditions do not provision infrastructure. Vercel Log Drains, Vercel Observability, Sentry, Datadog, or another provider can consume the JSON events later. If a vendor is adopted, preserve the existing event names and error taxonomy so instrumentation does not become vendor-specific.

## Copilot evaluation

Run `npm run eval:copilot`. The report measures only fixed repository cases and outputs total cases, pass count, failures, routing accuracy, tool-selection accuracy where an expected tool exists, security rejection accuracy and deterministic fallback correctness. It intentionally does not claim a generic or predictive “AI accuracy” score.

## Performance policy

Instrumentation performs bounded in-process formatting and console emission only. It does not synchronously call an observability vendor, serialize raw business records, or emit prompt bodies. Database diagnostics run only on the protected diagnostics route, not on normal page or chat traffic.
