# Deployment

Skylark Command targets a Node.js Next.js runtime and can operate in either current-state live mode or a PostgreSQL-backed temporal mode.

## Platform baseline

- Next.js 16 App Router
- React 19
- TypeScript
- Node.js 20.9+
- npm / `package-lock.json`
- Vercel-compatible Node runtime
- PostgreSQL required only for temporal-history modes

Recommended build configuration:

```text
Repository root: .
Install: npm ci
Build: npm run build
Framework: Next.js / auto-detect
```

Do not configure a static export; the application has dynamic server routes.

## Environment variables

### Live source — required

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `MONDAY_API_TOKEN` | Yes | Yes | Server-side monday.com GraphQL reads |
| `MONDAY_DEALS_BOARD_ID` | Yes | No | Deals board ID |
| `MONDAY_WORK_ORDERS_BOARD_ID` | Yes | No | Work Orders board ID |

### Optional AI provider

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | No | Yes | Preferred Gemini planning/interpretation key |
| `AI_API_KEY` | No | Yes | Backward-compatible fallback when `GEMINI_API_KEY` is unset |

If both are set, `GEMINI_API_KEY` takes precedence. Deterministic analytics do not require either provider key.

### Temporal data platform

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | For temporal modes | Yes | PostgreSQL connection string for analytical snapshots |
| `SKYLARK_DATA_MODE` | No | No | `live`, `temporal_preferred`, or `temporal_only`; defaults to `live` |
| `SKYLARK_WORKSPACE_KEY` | No | No | Workspace namespace for temporal snapshots; defaults to `skylark-command` |
| `SKYLARK_STALE_AFTER_MINUTES` | No | No | Freshness threshold for temporal serving; defaults to 60 |
| `CRON_SECRET` | For sync endpoint | Yes | Bearer secret protecting `/api/internal/sync/monday` |

Never expose any secret through a `NEXT_PUBLIC_` variable.

## Example configuration

### Current-state live mode

```dotenv
MONDAY_API_TOKEN=<server-side-token>
MONDAY_DEALS_BOARD_ID=<deals-board-id>
MONDAY_WORK_ORDERS_BOARD_ID=<work-orders-board-id>
SKYLARK_DATA_MODE=live

# Optional
GEMINI_API_KEY=<server-side-key>
```

### Temporal-preferred mode

```dotenv
MONDAY_API_TOKEN=<server-side-token>
MONDAY_DEALS_BOARD_ID=<deals-board-id>
MONDAY_WORK_ORDERS_BOARD_ID=<work-orders-board-id>

DATABASE_URL=<postgres-connection-string>
CRON_SECRET=<high-entropy-server-secret>
SKYLARK_DATA_MODE=temporal_preferred
SKYLARK_WORKSPACE_KEY=skylark-command
SKYLARK_STALE_AFTER_MINUTES=60

# Optional
GEMINI_API_KEY=<server-side-key>
```

## Database migration

Temporal mode requires the repository migration to be applied before snapshot reads/writes:

```bash
npm run db:migrate
```

The migration creates the temporal intelligence tables used for sync runs, analytical snapshots, and normalized Deal/Work Order records.

Apply migrations using a trusted deployment/admin environment. Do not expose database credentials to the browser.

## Data serving modes

### `live`

Reads current monday.com data for analytics. PostgreSQL is not required.

### `temporal_preferred`

Uses the temporal data platform according to the serving contract and can retain live data availability when durable history is not usable. This mode is appropriate when historical snapshots are being operationalized but current-state analytics must remain resilient.

### `temporal_only`

Requires the temporal store. Use only when the deployment intentionally treats persisted successful snapshots as the analytical serving source.

## Temporal snapshot sync

The repository exposes:

```text
GET /api/internal/sync/monday
Authorization: Bearer <CRON_SECRET>
```

The endpoint:

1. authenticates using a timing-safe bearer comparison;
2. fetches the configured monday.com boards;
3. normalizes source data;
4. persists a successful point-in-time analytical snapshot;
5. records sync metadata/watermarks;
6. returns safe sync metadata.

The repository does not assume a particular scheduler. A deployment can call this endpoint from Vercel Cron or another trusted scheduler, but scheduling configuration must be created and verified separately.

Historical Change Intelligence is only as useful as the real snapshot cadence. Do not advertise “since last week” behavior in an environment that has not captured the relevant states.

## API routes

### `GET /api/health`

Returns configuration-safe service metadata. It must not expose tokens, database URLs, or provider keys.

### `POST /api/chat`

Canonical Founder Copilot backend. Requests are validated and bounded before typed analytical orchestration.

### `GET /api/internal/sync/monday`

Authenticated temporal snapshot ingestion endpoint. It is not a public browser operation.

## monday.com boundary

The source client:

- imports `server-only`;
- uses query-only GraphQL patterns;
- rejects mutation text;
- paginates board items;
- uses no-store source fetching;
- does not embed an exported dataset as runtime truth.

## Gemini boundary

Gemini is optional and does not own business arithmetic.

Provider failure or invalid output must preserve authoritative deterministic analytical data. The provider can improve planning/interpretation but cannot create a new trusted metric merely through generated text.

## Function-duration and upstream risk

monday.com pagination, retries, and provider latency can increase function duration. Temporal sync adds database/network work as well.

Measure realistic runtime duration in a preview with the intended board sizes and hosting plan. Do not mask upstream timeout problems by weakening validation or silently returning stale/fabricated results.

## Release verification

Before promoting a deployment, follow [RELEASE.md](RELEASE.md):

```bash
npm ci
npm test
npm run lint
npm run build
```

Then run route/API smoke against the deployed URL and verify live or temporal source behavior for the selected mode.

## Rollback

Record the deployed git SHA and immutable deployment identifier. If post-promotion smoke fails, restore the last known-good deployment or stop promotion. Database migrations and snapshot data should be treated as durable infrastructure; avoid destructive rollback actions unless they are explicitly designed and tested.
