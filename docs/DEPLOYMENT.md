# Deployment Readiness

This document prepares Skylark Command for a fast Vercel release after integration and release QA are green. It is **not** authorization to deploy production from `agent-6-release-ops`.

## Release ownership

Before deployment, MASTER CHAT must confirm that the integrated release candidate contains the accepted work from the data/BI, product UI, backend/security, integration, QA, and release-ops branches. Production deployment should happen only from the approved integrated branch/commit.

## Current platform baseline

- Framework: Next.js 16 App Router
- Language: TypeScript
- Runtime used by `/api/chat`: Node.js
- Minimum local Node.js version: 20.9+
- Package manager commands: npm
- Vercel framework preset: Next.js / auto-detect
- Repository root directory: repository root (`.`)
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: use the Next.js/Vercel default; do not configure a static export

No `vercel.json` is required by the current codebase.

## Required production environment variables

Configure these as **server-side Vercel environment variables** for the final Preview and Production environments:

| Variable | Required | Purpose | Secret? |
| --- | --- | --- | --- |
| `MONDAY_API_TOKEN` | Yes | Authenticates read-only monday.com GraphQL requests | Yes |
| `MONDAY_DEALS_BOARD_ID` | Yes | Numeric Deals board ID | Treat as server configuration |
| `MONDAY_WORK_ORDERS_BOARD_ID` | Yes | Numeric Work Orders board ID | Treat as server configuration |

Requirements enforced by the data client:

- all three values must be non-empty;
- both board IDs must contain only digits;
- the monday token must never be exposed through a `NEXT_PUBLIC_` variable;
- no real values belong in `.env.example`, documentation, CI, or git history.

## Optional AI provider variables

The current Agent 3 baseline recognizes:

| Variable | Required | Purpose |
| --- | --- | --- |
| `AI_API_KEY` | No | Optional/reserved external AI provider key used by the Agent 3 provider contract when enabled |

Do not invent or configure a provider key unless the final integrated Agent 3 code actually consumes it. If the final backend introduces provider-specific variables (for example provider name, model, endpoint, or API key), MASTER CHAT must add those exact variables to this document and `.env.example` before production release.

All AI provider credentials must remain server-only.

## Server-only secret audit

The monday client imports `server-only`, reads credentials from `process.env`, and sends the token only in the server-side `Authorization` header to `https://api.monday.com/v2`.

Release check:

1. Search the final tree for `MONDAY_API_TOKEN`, `AI_API_KEY`, `NEXT_PUBLIC_`, and obvious token formats.
2. Confirm secrets appear only as variable names/placeholders, never real values.
3. Confirm client components do not read server credentials.
4. Confirm Vercel Preview and Production scopes contain the required monday variables.

## Runtime routes

### `GET /api/health`

- Dynamic route (`force-dynamic`).
- Returns HTTP 200 with service/configuration metadata.
- `status` is `ok` when all three monday variables are configured and `degraded` when core configuration is incomplete.
- Reports whether an optional AI provider variable is configured.
- This endpoint checks configuration presence only; it does **not** call monday.com.

A production candidate should not be signed off while `/api/health` reports `degraded`.

### `POST /api/chat`

- Dynamic route (`force-dynamic`).
- Explicit runtime: `nodejs`.
- Canonical Founder Copilot backend; do not add a competing `/api/copilot` backend.
- Accepts strict JSON shaped as `{ "message": "..." }`.
- Current limits: 2,000 message characters and 8,192 request bytes.
- Applies request IDs, safe public errors, and rate-limit headers.

## monday.com request behavior

The current read-only client:

- sends only GraphQL queries and explicitly rejects mutation text;
- disables fetch caching with `cache: "no-store"`;
- uses a 12,000 ms timeout per GraphQL attempt;
- allows 2 retries after the initial attempt for retryable failures;
- backs off between retries;
- paginates board items in pages of 100 by default;
- fetches Deals and Work Orders boards concurrently.

### Function-duration risk

A single page can consume up to roughly three 12-second attempts plus retry backoff in a worst-case upstream failure. A board with several pages performs those pages sequentially. Therefore, slow or rate-limited monday.com responses can push a request toward the hosting platform's function-duration limit even though normal requests should be much faster.

Before production release:

- run realistic `/api/chat` and dashboard requests against the Preview deployment with live monday.com configuration;
- inspect Vercel function durations/logs;
- confirm the current Vercel plan/runtime duration limit comfortably covers observed p95/p99 behavior;
- if timeouts occur, fix the data-access/runtime design in the owning engineering branch instead of merely hiding failures in release tooling.

Do not assume a particular Vercel duration limit in code or documentation because limits vary with platform configuration/plan.

## Vercel compatibility audit

The current backend baseline is compatible with Vercel's Next.js deployment model:

- App Router route handlers are used for API endpoints;
- `/api/chat` explicitly requests the Node.js runtime rather than Edge;
- no local filesystem persistence is required;
- secrets are read from runtime environment variables;
- external monday.com access is performed with standard `fetch`;
- security headers are declared through `next.config.ts`;
- the application is not configured for static export.

The final integrated candidate must still pass `npm run build` because Agent 2 UI changes can alter render/static-dynamic behavior.

## Pre-deployment release gate

From the exact candidate commit:

```bash
npm install
npm test
npm run lint
npm run build
```

All four must exit successfully.

Then create a **Preview** deployment (not Production), configure the required Preview environment variables, and run:

```bash
BASE_URL="https://<preview-host>" npm run smoke
```

To exercise the canonical chat route as well:

```bash
BASE_URL="https://<preview-host>" SMOKE_CHAT=1 npm run smoke
```

The smoke script verifies:

- `GET /`
- `GET /pipeline`
- `GET /operations`
- `GET /leadership`
- `GET /data-health`
- `GET /copilot`
- `GET /api/health`
- optional `POST /api/chat`

By default it requires `/api/health` to report `status: "ok"`. `ALLOW_DEGRADED_HEALTH=1` exists only for non-release troubleshooting and must not be used for production sign-off.

## Vercel release procedure for MASTER CHAT

1. Confirm Agent 4's integrated commit is approved by Agent 5 QA.
2. Merge/cherry-pick the release-ops files into the approved integration branch without replacing working Agent workflows.
3. Run the local/CI release gate: install, test, lint, build.
4. Import/link the repository in Vercel if not already linked.
5. Select the approved integration branch for a Preview deployment.
6. Add the three required monday variables to the Preview environment; add AI provider variables only if the final code requires them.
7. Deploy Preview.
8. Run `npm run smoke` against the Preview URL.
9. Run the chat smoke and manually verify desktop/mobile views, Leadership Brief, Data Health, and live monday metadata.
10. Inspect Vercel logs/functions for errors, timeouts, secret leakage, and unexpected retries.
11. Complete `docs/SUBMISSION_CHECKLIST.md`.
12. Only then promote/deploy the approved commit to Production.
13. Run the same smoke checks against the production URL and record the final hosted URL.

## Rollback readiness

Before production promotion, record:

- approved git SHA;
- Preview URL used for validation;
- production deployment ID/URL once created;
- previous known-good production deployment if one exists.

If production smoke fails, roll back to the previous known-good deployment or stop the submission release until the integration owner fixes the issue. Do not patch analytics/AI behavior directly from release operations.
