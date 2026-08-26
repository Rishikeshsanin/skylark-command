# Deployment Readiness

This document describes deployment configuration for Skylark Command. It is **not** authorization to deploy production. Temporal database operations are covered in detail by `docs/TEMPORAL_PRODUCTION_READINESS.md`.

## Platform baseline

- Next.js 16 App Router
- TypeScript
- Node.js runtime major: **24.x**
- Package manager: npm
- Vercel framework preset: Next.js / auto-detect
- Repository root: `.`
- Install: `npm ci`
- Build: `npm run build`
- Do not configure a static export

The connected Vercel `skylark-command` project was verified during the V2 temporal-readiness audit as Node.js 24.x. `package.json` pins the same major so local/CI/runtime expectations do not silently float to a future Node major.

## Required server environment variables

### Live monday source

| Variable | Required | Purpose | Secret? |
| --- | --- | --- | --- |
| `MONDAY_API_TOKEN` | Yes for live/sync | Authenticates monday.com GraphQL reads | Yes |
| `MONDAY_DEALS_BOARD_ID` | Yes for live/sync | Deals board ID (`5030844099`) | Server config |
| `MONDAY_WORK_ORDERS_BOARD_ID` | Yes for live/sync | Work Orders board ID (`5030844103`) | Server config |

The data client requires non-empty values and numeric board IDs. Never expose the token through `NEXT_PUBLIC_` variables or commit a real value.

### V2 temporal data platform

| Variable | Required | Purpose | Secret? |
| --- | --- | --- | --- |
| `DATABASE_URL` | Temporal modes/sync | Server-side PostgreSQL connection | Yes |
| `CRON_SECRET` | Scheduled sync | Bearer secret for `/api/internal/sync/monday` | Yes |
| `SKYLARK_DATA_MODE` | No | `live`, `temporal_preferred`, `temporal_only` | No |
| `SKYLARK_WORKSPACE_KEY` | No | Logical temporal workspace isolation | No |
| `SKYLARK_STALE_AFTER_MINUTES` | No | Temporal freshness threshold | No |
| `SKYLARK_DB_MAX_CONNECTIONS` | No | Bounded Postgres.js connections per server instance | No |

`DATABASE_URL` and `CRON_SECRET` are server-only. They must never use a `NEXT_PUBLIC_` prefix. Live/default mode remains independent of PostgreSQL.

For the current Vercel Hobby plan, the compatible cron cadence is daily. The readiness branch deliberately does **not** add active production cron configuration. See the temporal runbook for the proposed schedule and activation gate.

## Gemini executive explanation provider

Skylark Command uses Google Gemini for optional qualitative executive explanation:

```text
gemini-2.5-flash-lite
```

Key precedence is:

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | No | Preferred Gemini server API key |
| `AI_API_KEY` | No | Backward-compatible fallback when `GEMINI_API_KEY` is unset |

If both are configured, `GEMINI_API_KEY` wins. Both are server-only secrets and must never use a `NEXT_PUBLIC_` prefix.

Gemini is not the source of business arithmetic. Deterministic analytics remain authoritative. Provider failure must retain deterministic output/fallback behavior.

## Canonical API routes

### `GET /api/health`

Returns service/configuration metadata. It checks configuration presence; it is not a destructive dependency probe.

### `POST /api/chat`

This is the canonical Founder Copilot backend. The route applies strict validation, request IDs, rate limiting, safe public errors and deterministic analytics before optional model explanation.

### `GET /api/internal/sync/monday`

Server-only temporal synchronization endpoint.

- Requires `CRON_SECRET`.
- Requires `Authorization: Bearer <CRON_SECRET>`.
- Uses timing-safe comparison.
- Reads monday.com only.
- Persists through the temporal Postgres store.
- Returns a safe generic failure envelope instead of database/upstream secrets.
- Must not be exposed as an arbitrary SQL or GraphQL endpoint.

## monday.com behavior

The server-side monday client:

- imports `server-only`;
- sends GraphQL queries only and rejects mutation text;
- uses `cache: "no-store"`;
- paginates board items;
- uses bounded request timeout/retry behavior;
- fetches Deals and Work Orders server-side;
- does not embed assignment/business datasets in application code.

## Temporal migration gate

Never infer the target database from a connection string alone. Before migration, explicitly identify the environment as isolated staging or approved Skylark production.

From the exact candidate SHA:

```bash
npm ci
npm run db:migrate
npm run db:migrate
```

The second migration invocation must be a no-op. Then verify schema versions, checksums, indexes and the latest successful snapshot behavior described in `docs/TEMPORAL_PRODUCTION_READINESS.md`.

Do not run migrations against another project's database and do not create a destructive automatic rollback path.

## Required release gate

From the exact candidate SHA:

```bash
npm ci
npm test
npm run lint
npm run build
```

All must succeed. Do not skip evaluator/security/temporal regression suites.

The final candidate should also pass:

- tracked-repository secret scan;
- desktop/mobile smoke;
- route checks for `/`, `/copilot`, `/pipeline`, `/operations`, `/leadership`, `/data-health`, `/api/health`;
- `/api/chat` validation;
- red-team retest;
- controlled temporal sync validation when an explicitly isolated staging database exists.

## Secret audit

Search the tracked release tree for real values associated with:

- `MONDAY_API_TOKEN`
- `DATABASE_URL`
- `CRON_SECRET`
- `GEMINI_API_KEY`
- `AI_API_KEY`
- Bearer credentials
- passwords / hardcoded secrets
- `NEXT_PUBLIC_` references to server secrets

Environment names and empty/example placeholders are acceptable. Real credentials are not.

## Preview/release procedure

1. Record the exact approved SHA.
2. Confirm `package-lock.json` is present and matches dependency declarations.
3. Run install/test/lint/build on that SHA using Node 24.x.
4. Configure the three monday variables in Preview when live data is required.
5. Configure Gemini only when optional explanations are desired.
6. For temporal staging validation, configure only a separately authorized staging `DATABASE_URL` and staging `CRON_SECRET`.
7. Never point Preview/staging at an unknown production database.
8. Create a Preview deployment only when explicitly authorized.
9. Run the application smoke suite and inspect runtime logs.
10. Complete release/submission checks before any production promotion.

Vercel Cron Jobs themselves execute on production deployments, not Preview. Therefore preview validation of the sync route is manual/authenticated; cron activation happens only after explicit production release authorization.

## Function-duration risk

monday.com pagination and retry behavior can increase server execution time under upstream latency or rate limiting. The monday client currently bounds each request at 12 seconds with at most two retries and bounded backoff, but total sync duration also depends on pagination. Measure the controlled staging sync against the actual Vercel function-duration allowance before enabling production scheduling.

## Rollback and recovery readiness

Before production promotion, record:

- approved Git SHA;
- validated Preview URL;
- database migration versions/checksums;
- provider backup/restore status for the actual database plan;
- production deployment ID/URL once created;
- previous known-good application deployment.

Application rollback must not delete temporal history. Database recovery uses the managed provider's verified restore mechanism; migrations are forward-only and the repository intentionally does not automate destructive down migrations.
