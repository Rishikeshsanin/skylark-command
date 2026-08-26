# Deployment

Skylark Command targets a Node.js Next.js runtime and can operate in either current-state public-demo live mode or a PostgreSQL-backed temporal/workspace mode.

## Platform baseline

- Next.js 16 App Router
- React 19
- TypeScript
- Node.js **24.x** (repository runtime pin)
- npm / `package-lock.json`
- Vercel-compatible Node runtime
- PostgreSQL required for temporal-history and authenticated workspace analytical serving

Recommended build configuration:

```text
Repository root: .
Install: npm ci
Build: npm run build
Framework: Next.js / auto-detect
```

Do not configure a static export; the application has dynamic server routes.

## Environment variables

### Live monday.com source

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `MONDAY_API_TOKEN` | For configured live/source sync | Yes | Server-side monday.com GraphQL reads |
| `MONDAY_DEALS_BOARD_ID` | For configured live/source sync | No | Deals board ID |
| `MONDAY_WORK_ORDERS_BOARD_ID` | For configured live/source sync | No | Work Orders board ID |

### Optional AI provider

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | No | Yes | Preferred Gemini planning/interpretation key |
| `AI_API_KEY` | No | Yes | Backward-compatible fallback when `GEMINI_API_KEY` is unset |

If both are set, `GEMINI_API_KEY` takes precedence. Deterministic analytics do not require either provider key.

### Temporal data platform

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | For temporal/workspace data modes | Yes | PostgreSQL connection string for migrations, snapshots, workspaces, memberships, connector refs, and audit foundation |
| `SKYLARK_DATA_MODE` | No | No | `live`, `temporal_preferred`, or `temporal_only`; defaults to `live` |
| `SKYLARK_WORKSPACE_KEY` | No | No | Default/public temporal workspace namespace; defaults to `skylark-command` |
| `SKYLARK_STALE_AFTER_MINUTES` | No | No | Freshness threshold for temporal serving; defaults to 60 |
| `SKYLARK_DB_MAX_CONNECTIONS` | No | No | Serverless PostgreSQL connection cap; default/recommended value is 1 and implementation remains bounded |
| `CRON_SECRET` | For internal sync/diagnostics | Yes | Bearer secret protecting `/api/internal/sync/monday` and `/api/internal/diagnostics` |

### Managed identity validation

| Variable | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `SUPABASE_URL` | For managed authenticated workspace mode | No | Supabase project URL used for access-token validation |
| `SUPABASE_PUBLISHABLE_KEY` | For managed authenticated workspace mode | No | Publishable key sufficient for Auth validation |

Do **not** add a Supabase service-role/secret credential unless future server code genuinely requires it. Current auth validation and persisted membership/RBAC do not require one.

Never expose monday/database/cron/provider credentials through a `NEXT_PUBLIC_` variable.

## Example configuration

### Public current-state demo mode

```dotenv
MONDAY_API_TOKEN=<server-side-token>
MONDAY_DEALS_BOARD_ID=<deals-board-id>
MONDAY_WORK_ORDERS_BOARD_ID=<work-orders-board-id>
SKYLARK_DATA_MODE=live

# Optional
GEMINI_API_KEY=<server-side-key>
```

A request without an explicit workspace selector remains in public read-only demo mode.

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
SKYLARK_DB_MAX_CONNECTIONS=1

# Optional
GEMINI_API_KEY=<server-side-key>
```

### Managed authenticated workspace foundation

```dotenv
DATABASE_URL=<postgres-connection-string>
SKYLARK_DATA_MODE=temporal_preferred
SUPABASE_URL=<supabase-project-url>
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

An explicit workspace selector requires a valid managed-auth identity plus an exact active persisted workspace membership. The canonical role comes from `workspace_members`, never from a client-provided role. Authenticated workspace requests fail closed if isolated temporal workspace data serving is not configured; they must not fall back to public or another workspace's data.

The current repository does not yet provide a full frontend login/account-management experience or workspace-specific source-secret resolution/sync workflow.

## Database migrations

The migration runner discovers and applies these migrations in this exact order:

1. `001_temporal_intelligence.sql`
2. `002_temporal_production_hardening.sql`
3. `003_identity_workspace_rbac.sql`

Run from a trusted admin/staging environment only:

```bash
npm run db:migrate
```

The runner records a SHA-256 checksum for each migration. Re-running is idempotent; an already-applied migration with a changed checksum is rejected rather than silently accepting drift. Pre-checksum installations are baselined once and then protected on subsequent runs.

`002_temporal_production_hardening` adds the production-oriented temporal indexes/constraints needed for successful-snapshot lookup and one-active-sync behavior. `003_identity_workspace_rbac` adds the identity/workspace/membership/connector/audit foundation. Do not renumber or edit applied migration semantics in place.

### Current rollout status

- Migration hardening is implemented and unit/integration-tested in code.
- **Isolated real staging PostgreSQL migration validation is still pending.**
- **No production database migration has been executed as part of V2 integration.**
- **No production cron has been activated as part of V2 integration.**
- Do not use an unrelated existing database to make migration checks appear complete.

## Data serving modes

### `live`

Reads current monday.com data for public/demo analytics. PostgreSQL is not required for that public path.

An explicit authenticated workspace request does not use the shared public live source as a fallback; workspace requests require isolated temporal serving and fail closed when it is unavailable.

### `temporal_preferred`

Uses the latest successful workspace-scoped temporal snapshot when available and retains the serving contract's safe fallback behavior where permitted. This is the intended base for durable history/workspace serving once migrations and snapshot capture are operationally validated.

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
2. fetches configured monday.com boards using the read-only client;
3. normalizes source data;
4. enforces the temporal sync lifecycle, including one-active-sync-per-workspace behavior and abandoned-run recovery in the store;
5. persists/reuses an idempotent point-in-time analytical snapshot by watermark;
6. records successful/failed sync metadata while preserving the original underlying error;
7. emits structured sync telemetry including request/sync IDs, duration, counts, watermark, and freshness;
8. returns safe external metadata/errors.

The code does not activate a scheduler by itself. A Vercel Cron or another trusted scheduler must be deliberately configured after staging validation and production rollout approval.

Historical Change Intelligence is only as useful as the real snapshot cadence. Do not advertise “since last week” behavior in an environment that has not captured the relevant states.

## Auth / workspace / RBAC behavior

The server-side foundation supports:

- managed access-token validation;
- Workspace / WorkspaceMember / WorkspaceConnector persistence;
- roles `VIEWER`, `ANALYST`, `ADMIN`, `OWNER`;
- exact active membership authorization;
- public read-only demo mode without a workspace selector;
- isolated authenticated workspace mode with a selector;
- server-owned configuration/membership permissions;
- `VIEWER` Scenario Lab denial before scenario execution;
- audit-event foundation.

A forged client/JWT role claim does not override persisted membership authorization.

## Observability and diagnostics

Observability is implemented as structured vendor-neutral server events. It includes request IDs, AsyncLocalStorage context, request/tool/provider/database/sync latency and result telemetry, error taxonomy, secret redaction, alert-condition helpers, and the fixed Copilot evaluation runner.

The logger intentionally does **not** log full prompt bodies, chain-of-thought, or raw business records.

### `GET /api/health`

Returns configuration-safe service metadata and request ID. It must not expose tokens, database URLs, provider keys, or detailed protected database diagnostics.

### `GET /api/internal/diagnostics`

Protected with the same timing-safe `CRON_SECRET` bearer model. It can probe bounded PostgreSQL/temporal freshness state for operators. It is not public health metadata.

### `POST /api/chat`

Canonical Founder Copilot backend. Requests are bounded and validated, access mode/membership is resolved server-side, workspace data scope is applied, typed analytical orchestration runs, and safe structured request/tool/provider telemetry is emitted.

### `GET /api/internal/sync/monday`

Protected temporal snapshot ingestion endpoint. It is not a public browser operation.

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

Provider failure or invalid output must preserve authoritative deterministic analytical data. The provider can improve planning/interpretation but cannot create a new trusted metric merely through generated text. Provider-fallback telemetry records the operational outcome without logging the question payload.

## Function-duration and upstream risk

monday.com pagination/retries, provider latency, and temporal database work can increase function duration.

Measure realistic runtime duration in a preview with the intended board sizes and hosting plan. Do not mask upstream timeout problems by weakening validation or silently returning stale/fabricated results.

## Release verification

Before promoting a deployment, follow [RELEASE.md](RELEASE.md):

```bash
npm ci
npm run eval:copilot
npm test
npm run lint
npm run build
```

Then run route/API smoke against the exact candidate SHA, validate the selected public/workspace data mode, and verify live or temporal source behavior where credentials and an isolated test environment are intentionally available.

## Rollback

Record the deployed git SHA and immutable deployment identifier. If post-promotion smoke fails, restore the last known-good deployment or stop promotion. Database migrations and snapshot data should be treated as durable infrastructure; avoid destructive rollback actions unless they are explicitly designed and tested.
