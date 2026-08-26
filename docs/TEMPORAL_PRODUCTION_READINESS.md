# Skylark Command V2 Temporal Production Readiness

This runbook covers the existing temporal PostgreSQL foundation. It does not authorize a production database migration or a production Vercel deployment.

## Current architecture

The durable path is:

`read-only monday.com -> normalization -> source watermark -> sync run -> analytical snapshot -> Deal/Work Order snapshot rows -> historical snapshot provider -> Change Intelligence / Customer 360 / Copilot`

The deterministic source watermark intentionally excludes fetch time. An unchanged monday source state therefore produces another successful `sync_runs` record while reusing the existing logical `analytical_snapshots` row.

## Environment contract

All database and scheduler credentials are server-only. Never prefix them with `NEXT_PUBLIC_` and never commit real values.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Temporal modes / sync only | PostgreSQL connection used by the server-side temporal store |
| `CRON_SECRET` | Internal scheduled sync only | Bearer secret required by `/api/internal/sync/monday` |
| `SKYLARK_DATA_MODE` | No | `live`, `temporal_preferred`, or `temporal_only`; defaults safely to live |
| `SKYLARK_WORKSPACE_KEY` | No | Logical isolation key; defaults to `skylark-command` |
| `SKYLARK_STALE_AFTER_MINUTES` | No | Freshness threshold; code default is 60 minutes |
| `SKYLARK_DB_MAX_CONNECTIONS` | No | Per-instance Postgres.js max; defaults to 1 and is clamped to 5 |
| `MONDAY_API_TOKEN` | Live/sync | Read-only monday API credential |
| `MONDAY_DEALS_BOARD_ID` | Live/sync | Deals source board |
| `MONDAY_WORK_ORDERS_BOARD_ID` | Live/sync | Work Orders source board |

For Supabase serverless runtime traffic, use a Supavisor transaction-pooler connection string and keep prepared statements disabled. For migrations, backup/restore tooling, or other single administrative sessions, use the provider-recommended direct/admin connection when the network supports it. Do not reuse a browser/public API key as `DATABASE_URL`.

## Data modes

### `live` / default

- Preserves the V1-compatible behavior.
- Does not require `DATABASE_URL`.
- Reads and normalizes monday.com directly.
- No historical state is fabricated.

### `temporal_preferred`

- Attempts the latest **successful** persisted snapshot first.
- Serves that last-known-good snapshot even when the latest sync failed; freshness metadata reports `failed` or `stale` truthfully.
- If no durable snapshot exists or the default temporal store is unavailable, falls back to the live read path.
- Does not create a fake historical row during fallback.

### `temporal_only`

- Requires the temporal store and a successful snapshot.
- Propagates database errors.
- Fails explicitly if no successful temporal snapshot exists.
- Never silently substitutes live data.

## Migrations

Migrations are ordered in `src/lib/data-platform/migrate.ts` and recorded in `schema_migrations`.

Current versions:

1. `001_temporal_intelligence`
2. `002_temporal_production_hardening`

The migration runner now stores a SHA-256 checksum for each migration. Existing pre-checksum installations are baselined once; after a checksum is present, editing an applied migration in place fails closed.

### Clean staging procedure

Use **only an explicitly isolated Skylark V2 staging database**.

1. Confirm the database/project identity and environment before setting `DATABASE_URL`.
2. Use an administrative/direct connection suitable for DDL.
3. From the exact candidate SHA:

```bash
npm ci
npm run db:migrate
npm run db:migrate
```

4. The first run should apply both versions on a clean database. The second must report that the schema is already up to date.
5. Verify `schema_migrations` contains both versions and non-null checksums.
6. Verify required indexes:
   - `analytical_snapshots_workspace_time_idx`
   - `sync_runs_workspace_snapshot_success_idx`
   - `sync_runs_workspace_active_idx`
   - existing sync, Deal history, Work Order history indexes
7. Confirm the foreign keys from snapshot rows/sync runs to `analytical_snapshots`.
8. Confirm nullable business fields remain nullable and JSON normalized payloads preserve nulls.

The hardening migration creates one active-sync unique index per workspace. If an existing environment already has multiple `syncing` rows for the same workspace, **stop and investigate them manually** before migration; do not delete history to make the index pass.

### Supabase exposure hardening

When standard Supabase `anon`/`authenticated` roles exist, migration 002 enables RLS and revokes their table privileges for the temporal tables. The application is server-side only and does not expose temporal tables through the Data API. Do not add public RLS policies for this subsystem.

## Controlled staging sync

Only after migration succeeds against an isolated staging database:

1. Configure staging-only `DATABASE_URL`, `CRON_SECRET`, and the existing read-only monday variables.
2. Keep `SKYLARK_WORKSPACE_KEY=skylark-command-v2-staging` (or another explicit staging-only key).
3. Invoke `GET /api/internal/sync/monday` with `Authorization: Bearer <CRON_SECRET>` from the staging deployment/operator environment.
4. Record:
   - Deal count
   - Work Order count
   - normalization issue count
   - source watermark
   - source fetched time
   - persisted snapshot ID
   - sync run ID/status
   - freshness state
5. Query the latest successful snapshot and verify source metadata/null preservation.
6. Repeat the sync without changing monday data. The second successful run should have the same source watermark/snapshot ID and `recordsPersisted = 0` / `reusedExistingSnapshot = true`.
7. Do not mutate monday.com to manufacture a changed snapshot.

## Sync concurrency and failure behavior

- Only one `syncing` run is permitted per workspace.
- A second invocation while a recent sync lease is active fails closed.
- A `syncing` row older than 15 minutes is treated as an abandoned serverless invocation and is marked failed before a new run starts.
- A source/persistence failure attempts to mark its run failed.
- If recording that failure also fails because PostgreSQL is unavailable, the original source/persistence error is preserved for the caller.
- Failed syncs never replace the latest successful analytical snapshot.

## Freshness and last-known-good

Freshness is based on the latest successful sync and the configured threshold, with `syncing`/`failed` taking precedence for the latest run state.

The current Vercel project is on the Hobby plan, so the production-compatible schedule is **daily**, not hourly. For a daily schedule, production should explicitly set `SKYLARK_STALE_AFTER_MINUTES=1500` (25 hours). This gives a one-hour grace window after the next expected daily run before the source is classified stale. The 60-minute code default remains useful for manual/staging workflows and should not be mistaken for the recommended Hobby production value.

## Vercel scheduled sync strategy

Verified hosting baseline:

- Next.js project
- Vercel Hobby plan
- Node.js 24.x project runtime
- Cron Jobs run on production deployments, not Preview deployments

Proposed production schedule **after release authorization**:

```json
{
  "crons": [
    {
      "path": "/api/internal/sync/monday",
      "schedule": "0 0 * * *"
    }
  ]
}
```

This configuration is intentionally **not** committed as active `vercel.json` configuration on the readiness branch because doing so would activate the job on a future production deployment.

Vercel sends `CRON_SECRET` in the Authorization Bearer header. The route already rejects missing configuration with 503 and invalid authorization with 401 using timing-safe comparison.

### Retry and timeout assumptions

- Do not assume Vercel Cron retries a failed request automatically; treat each scheduled invocation as one attempt and alert/inspect failures.
- An operator may manually retry the same endpoint after the upstream/database issue is understood. Watermark idempotency prevents duplicate logical snapshots from an unchanged source state.
- The monday client has a 12-second per-request timeout and at most two retries with bounded backoff. Pagination can therefore extend total function duration; observe staging/production timings against the actual Vercel function-duration allowance before activation.
- Do not increase cron frequency to hide upstream reliability problems.

## Change Intelligence and Customer 360 validation

Persisted history is enumerated only from `analytical_snapshots` referenced by successful `sync_runs`.

Expected flow:

`Postgres successful snapshots -> loadAvailableChangeSnapshots -> detectChangeIntelligence -> Customer 360 historicalSnapshots / Copilot getChangeIntelligence`

With only one successful unique staging snapshot, Change Intelligence must report insufficient historical comparison. Do not clone or alter a snapshot merely to produce a delta. A second logical snapshot should exist only after the source watermark genuinely changes.

## Production migration procedure

1. Obtain release approval for an exact Git SHA.
2. Confirm the target `DATABASE_URL` belongs to the intended Skylark production database. Never infer this from a hostname alone.
3. Prevent scheduled/manual sync execution during the migration window.
4. Verify the database provider's backup/restore capability for the actual plan and create the provider-supported restore point/backup if available.
5. Run the same migration command used in isolated staging from the approved SHA.
6. Re-run migrations to confirm idempotency.
7. Validate schema versions/indexes.
8. Run one controlled sync and verify counts, watermark, freshness and LKG before enabling temporal serving modes.
9. Enable `temporal_preferred` first. Use `temporal_only` only when operators explicitly want DB availability to be mandatory.
10. Activate the production cron only after the controlled sync and release smoke pass.

## Backup and recovery expectations

The repository does not implement its own destructive rollback or backup engine.

- Use the managed PostgreSQL provider's documented backups/PITR only when that feature is actually enabled for the selected plan.
- Periodically test restore into an isolated non-production database; an untested backup is not a recovery plan.
- Schema migrations are forward-only in Git. Do not automatically drop tables/columns after a failed release.
- For an application rollback, restore the previous application deployment while preserving temporal history unless the database itself is known corrupt.
- For a database recovery, follow the provider's documented restore process and validate `schema_migrations`, latest successful snapshot, counts and source watermark afterward.

## Outage behavior

### monday.com outage

- New sync run fails and is recorded as failed when PostgreSQL remains available.
- Last successful snapshot remains unchanged.
- `temporal_preferred` continues serving LKG with truthful failed/stale freshness.
- `live` requests can fail because monday is the direct dependency.

### Database outage

- `live` mode remains independent of PostgreSQL.
- `temporal_preferred` falls back to live data when the default temporal store cannot be reached.
- `temporal_only` fails explicitly.
- A sync can fail before failure metadata is persisted; the original failure remains surfaced, and a stale `syncing` lease is recovered on a later successful DB connection.

## Credential rotation

### `DATABASE_URL`

1. Create/rotate the database credential in the provider.
2. Update the server-side environment variable in staging/preview first.
3. Validate migration status and a read/write staging sync.
4. Update production during an approved window.
5. Revoke the old credential only after the new connection is verified.

### `CRON_SECRET`

1. Generate a strong random replacement outside Git.
2. Update the Vercel server environment.
3. Redeploy/restart as required by the hosting environment.
4. Validate that the old secret is rejected and the new secret authorizes the sync route.

### monday token

Rotate through monday.com and update only server-side environment configuration. The application must remain query-only; never broaden its scope to mutations for temporal sync.

## Staging validation status for this readiness branch

At audit time, the connected Supabase account exposed one project named `Project Hub` and no development branches. That project is not explicitly identified as Skylark staging and was therefore **not accessed or modified**. Creating a fresh managed project/branch requires explicit organization/cost authorization. Until an isolated Skylark V2 database is explicitly provisioned, real migration and monday-to-Postgres staging sync validation remain blocked by infrastructure rather than application code.
