# Release & Quality Gates

This document defines how a Skylark Command source state is validated before it is considered ready for a preview or production promotion. It is intentionally SHA-based so quality evidence cannot be detached from the code that produced it.

## Required source-state checks

From a clean checkout of the exact candidate SHA:

```bash
npm ci
npm test
npm run lint
npm run build
```

All four commands must succeed.

Avoid permanently quoting a repository-wide test count in product documentation. Test suites evolve; record exact counts in the CI run associated with a specific SHA when they are useful as evidence.

## What the automated tests cover

The current test tree includes coverage for:

- normalization and malformed/unknown values;
- deterministic pipeline and operations analytics;
- period semantics;
- exact cross-board joins;
- customer rankings and contribution;
- Customer 360;
- temporal snapshot persistence and history queries;
- Change Intelligence;
- semantic definitions, lineage, and evidence quality;
- Copilot routing, typed tools, grounding, and multi-turn behavior;
- provider failure/fallback;
- prompt injection and untrusted source data;
- request validation, safe errors, timeouts, rate limiting, and health metadata;
- visualization/presentation regressions.

## Documentation integrity

A product-facing documentation change should also verify:

- relative Markdown links resolve;
- screenshot/image paths resolve;
- Mermaid blocks use supported GitHub syntax;
- no stale temporary product-positioning language remains;
- no credential value, token, password, or private connection string is committed;
- public claims match shipped code and configured deployment behavior.

## Runtime smoke

For a reachable deployment:

```bash
BASE_URL="https://your-preview.example" npm run smoke
```

Where safe and configured, chat behavior can also be included:

```bash
BASE_URL="https://your-preview.example" SMOKE_CHAT=1 npm run smoke
```

At minimum verify:

- `/`
- `/changes`
- `/copilot`
- `/pipeline`
- `/operations`
- `/leadership`
- `/data-health`
- one valid `/customers/[clientKey]` route when a known configured customer key is available
- `/api/health`
- `/api/chat`

## Live-data sanity

A production-like environment should prove more than route availability.

Validate that:

- monday.com data is being fetched/served from the intended mode;
- known-only monetary metrics disclose incomplete coverage;
- source freshness is plausible;
- exact client matching behaves as expected;
- a provider outage does not corrupt deterministic results;
- no secret appears in browser-delivered assets or public error bodies.

Do not hardcode historical business baselines into runtime code to make a check pass.

## Temporal-history gate

Before advertising historical Change Intelligence for a deployment:

1. `DATABASE_URL` is configured for a temporal mode.
2. Database migration has been applied.
3. `CRON_SECRET` protects `/api/internal/sync/monday`.
4. At least two successful snapshots exist for the interval being demonstrated.
5. Snapshot timestamps/freshness look correct.
6. Change Detective uses persisted successful snapshots rather than synthetic history.
7. Sparse history produces an honest caveat/no-comparison result.

A deployment can still run current-state analytics in `live` mode without temporal history; the limitation should be described accurately.

## Scenario gate

Scenario Lab should be checked for:

- immutable baseline behavior;
- valid record-ID grounding;
- invalid/oversized monetary override rejection;
- baseline and scenario using the same analytical tool;
- deterministic deltas;
- no source mutation path.

## Security review

Review the tracked tree for accidental real values associated with:

- `MONDAY_API_TOKEN`
- `GEMINI_API_KEY`
- `AI_API_KEY`
- `DATABASE_URL`
- `CRON_SECRET`
- bearer credentials
- passwords/private keys
- server secrets placed behind a `NEXT_PUBLIC_` name

Environment-variable names and empty example placeholders are expected; real credential values are not.

## Preview checklist

1. Record the exact source SHA.
2. Run clean install, tests, lint, and build.
3. Configure only the environment variables required for that deployment mode.
4. Apply temporal migration if temporal mode is enabled.
5. Deploy a preview.
6. Run route/API smoke.
7. Validate live-source freshness and known/unknown coverage.
8. Validate Change Intelligence only if genuine history exists.
9. Validate provider fallback without changing authoritative metrics.
10. Inspect logs for timeouts, sync failures, and accidental sensitive content.
11. Capture real screenshots only after behavior is verified.
12. Record the preview URL alongside the tested SHA.

## Production promotion

A production promotion should use the same tested artifact/source state where possible. Record:

- git SHA;
- immutable deployment ID/URL;
- validation time;
- temporal migration version if enabled;
- previous known-good deployment for rollback.

If post-promotion smoke fails, roll back or halt promotion. Do not bypass analytics, history, or security guards to make a deployment appear healthy.

## Current architecture risks worth watching

- Process-local chat rate limiting is not globally distributed across serverless instances.
- Upstream monday.com pagination/retry latency can increase function duration.
- Temporal mode introduces PostgreSQL availability and migration concerns.
- Historical intelligence quality depends on snapshot cadence and retention.
- Generated interpretation is provider-dependent even though deterministic analytics are not.

These are operational risks to manage, not reasons to weaken the trust boundary.
