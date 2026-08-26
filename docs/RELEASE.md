# Release & Quality Gates

This document defines how a Skylark Command source state is validated before it is considered ready for a preview or production promotion. It is intentionally SHA-based so quality evidence cannot be detached from the code that produced it.

## Required source-state checks

From a clean checkout of the exact candidate SHA:

```bash
npm ci
npm run eval:copilot
npm test
npm run lint
npm run build
```

All commands must succeed for the same SHA.

The fixed Copilot evaluation currently has an expected repository baseline of:

- total: `43 / 43`
- routing: `31 / 31`
- tool selection: `8 / 8`
- security rejection: `3 / 3`
- deterministic fallback: `2 / 2`

Do not edit expectations merely to preserve green. The evaluation is a fixed repository acceptance suite, not a generic AI-accuracy claim.

Avoid permanently quoting a repository-wide test count in product documentation. Test suites evolve; record exact test counts in the CI run associated with a specific SHA when useful as evidence.

## Integrated hardening state

The current V2 codebase includes:

- temporal-production hardening;
- migration checksum persistence and checksum-drift rejection;
- canonical migrations `001_temporal_intelligence`, `002_temporal_production_hardening`, and `003_identity_workspace_rbac`;
- public demo and authenticated workspace backend modes;
- server-owned workspace membership/RBAC foundation with `OWNER`, `ADMIN`, `ANALYST`, `VIEWER` roles;
- request IDs, structured telemetry, secret redaction, protected diagnostics, and alert-condition evaluation;
- fixed Copilot evaluation runner;
- responsive/mobile fixes and deterministic hydration-safe INR formatting.

These are repository capabilities. They do **not** by themselves prove that production migrations/cron, a real isolated staging database, long-running temporal history, frontend account management, or production connector-secret resolution have been operationalized.

## What is intentionally not claimed yet

Do not claim the following without separate deployment evidence:

- finished frontend login/account-management UI;
- successful migration of a real isolated Skylark staging database;
- production database migration;
- production cron activation;
- long-running real historical accumulation;
- production workspace-specific connector secret resolution;
- predictive ML models.

## What the automated tests cover

The current test tree includes coverage for:

- normalization and malformed/unknown values;
- deterministic pipeline and operations analytics;
- period semantics;
- exact cross-board joins;
- customer rankings and contribution;
- Customer 360;
- temporal snapshot persistence/history queries;
- temporal serving modes, last-known-good behavior, failed/stale states, and sync concurrency behavior;
- migration order, idempotence, checksums, checksum drift, and migration numbering;
- public/authenticated workspace resolution and role authorization;
- inactive/suspended membership and cross-workspace denial;
- viewer/analyst/admin/owner capability boundaries;
- Change Intelligence;
- semantic definitions, lineage, and evidence quality;
- Copilot routing, typed tools, grounding, structured follow-ups, and multi-turn behavior;
- provider failure/fallback;
- prompt injection and untrusted source data;
- request validation, safe errors, timeouts, rate limiting, request IDs, telemetry, diagnostics, health metadata, and alerts;
- visualization, hydration, and presentation regressions.

## Migration regression gate

The canonical migration order is:

1. `001_temporal_intelligence`
2. `002_temporal_production_hardening`
3. `003_identity_workspace_rbac`

Release qualification must verify:

- discovery order is exactly `001 → 002 → 003`;
- first run applies those three in order;
- a repeat run applies nothing;
- SHA-256 checksums are persisted;
- a changed previously applied migration fails closed with checksum mismatch;
- migration IDs are unique;
- no stale `002_identity_workspace_rbac` file/registry entry exists;
- the one-active-sync-per-workspace constraint/index remains present.

These checks can run against test doubles/static repository state. **Do not use Project Hub, production, an unknown database, or an unrelated external database as a migration test target.**

A real isolated Skylark staging-database migration remains a separate operational proof step.

## Documentation integrity

A product-facing documentation change should verify:

- relative Markdown links resolve;
- screenshot/image paths resolve;
- Mermaid blocks use supported GitHub syntax;
- no stale temporary product-positioning language remains;
- no credential value, token, password, private key, or private connection string is committed;
- public claims match shipped code and configured deployment behavior.

## Repository hygiene and security sweep

Before qualifying the exact candidate SHA, scan the tracked tree for unresolved merge markers:

```text
<<<<<<<
=======
>>>>>>>
```

Review committed source/configuration for accidental real values associated with:

- `MONDAY_API_TOKEN`
- `DATABASE_URL`
- `CRON_SECRET`
- `GEMINI_API_KEY`
- `AI_API_KEY`
- Supabase keys/secrets
- bearer credentials
- passwords/private keys
- sensitive values exposed through `NEXT_PUBLIC_` names

Environment-variable names, `process.env.*` references, and empty/documented placeholders are expected; real credential values are not.

Also verify the integrated architecture still has these boundaries:

- no raw Authorization logging;
- no raw prompt logging;
- no raw business-record logging;
- no arbitrary SQL API endpoint;
- no arbitrary GraphQL API endpoint;
- no monday.com mutation path;
- no client-trusted RBAC authority;
- no cross-workspace fallback;
- no LLM-owned pipeline/revenue/receivables/count/ranking/scenario arithmetic;
- diagnostics protected;
- temporal sync protected;
- public demo remains read-only.

Do not weaken tests or guards to make this sweep pass.

## Auth / workspace / RBAC gate

Final regression should preserve:

- public demo works without a workspace selector;
- explicit workspace selection requires authenticated identity;
- inactive/suspended members are denied;
- `VIEWER` can use allowed read-only analytics;
- `VIEWER` scenario execution is denied before the scenario tool runs;
- `ANALYST` can execute allowed scenarios;
- `ADMIN` receives the intended configuration capability;
- `OWNER` receives intended membership-management capability;
- forged client/JWT role claims do not override persisted membership roles;
- cross-workspace access is denied.

The repository includes a backend auth/workspace/RBAC foundation. A finished frontend account-management UX is not a release claim.

## Observability gate

Verify:

- request IDs are generated when absent;
- safe valid inbound request IDs are preserved;
- secret-like values are redacted;
- public errors stay sanitized;
- deterministic tool execution emits bounded telemetry;
- provider fallback is observable without replacing deterministic data;
- sync lifecycle/record-count/freshness telemetry remains present;
- diagnostics requires internal authorization;
- alert-condition evaluation remains deterministic.

Telemetry must not include full prompts, chain-of-thought, raw Authorization values, or raw business records.

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

## Focused browser regression

After the final combined integration, run focused browser QA at:

- `1440×900`
- `1366×768`
- `768×1024`
- `390×844`
- `375×667`

Primary routes:

- `/`
- `/copilot`
- `/customers/COMPANY089`
- `/changes`
- `/data-health`

Smoke routes:

- `/pipeline`
- `/operations`
- `/leadership`

Check:

- no hydration warnings;
- no page-level horizontal overflow;
- no sticky Copilot composer overlap;
- Jump to latest behavior;
- composer focus restoration;
- deterministic INR display;
- readable Customer 360 receivables KPI;
- `>=44px` mobile targets on the hardened interactive surfaces;
- reduced-motion behavior;
- chart readability;
- no visible auth/observability integration regression.

If the environment lacks real historical snapshots, validate the honest sparse-history state. Do not fabricate a historical comparison solely for visual testing.

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
2. Database migrations `001/002/003` have been applied to that intended environment.
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
- no source mutation path;
- role authorization before execution in authenticated workspace mode.

## Preview checklist

1. Record the exact source SHA.
2. Run clean install, fixed Copilot evaluation, tests, lint, and build on that exact SHA.
3. Run migration/security/secret/merge-marker regression on that SHA.
4. Verify final repository CI is green for that SHA.
5. Inspect the Vercel **Preview** created from that SHA and confirm it is `READY` and `target=preview`.
6. Configure only the environment variables required for that preview mode.
7. Do not run production migrations or activate production cron as part of preview qualification.
8. Run route/API smoke against the exact preview.
9. Validate Change Intelligence only if genuine history exists.
10. Validate provider fallback without changing authoritative metrics.
11. Inspect preview logs for timeouts, sync failures, and accidental sensitive content.
12. Capture real screenshots only after behavior is verified.
13. Record the preview URL alongside the tested SHA.

## Production promotion

Production promotion is a **separate master-review step**. Release qualification of `v2-integration` does not authorize:

- production database migration;
- production cron activation;
- production environment-variable changes;
- production alias changes;
- deployment of V2 to production.

When production promotion is later authorized, use the same tested artifact/source state where possible and record:

- git SHA;
- immutable deployment ID/URL;
- validation time;
- migration version/state;
- previous known-good deployment for rollback.

If post-promotion smoke fails, roll back or halt promotion. Do not bypass analytics, history, authorization, or security guards to make a deployment appear healthy.

## Current risks and unproven operational steps

- Process-local chat rate limiting is not globally distributed across serverless instances.
- Upstream monday.com pagination/retry latency can increase function duration.
- A real isolated Skylark staging database has not yet been used to prove the complete migration chain.
- Production migrations and production cron are intentionally not activated by repository integration.
- Historical intelligence quality depends on real snapshot cadence and retention; long-running accumulation is not claimed until observed.
- Production workspace-specific connector secret resolution remains an operational integration step.
- Frontend login/account-management UI is not claimed as shipped.
- Generated interpretation is provider-dependent even though deterministic analytics are not.
- Predictive ML remains future research, not a shipped feature.

These are operational risks or boundaries to manage, not reasons to weaken the trust model.
