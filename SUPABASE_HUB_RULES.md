# Supabase Project Hub Rules — Skylark Command

Skylark Command shares one Supabase project with multiple independent applications. Treat every other application in Project Hub as a separate company. Isolation is mandatory.

## Skylark identity

| Field | Value |
| --- | --- |
| Application | Skylark Command |
| Slug | `skylark_command` |
| Schema | `skylark_command` |
| Repository | `https://github.com/Rishikeshsanin/skylark-command` |

Skylark application data, tables, views, app-specific database functions/RPCs, and related database objects must be isolated to `skylark_command.*` unless a shared Project Hub resource has been explicitly approved and registered.

## Other applications are out of scope

Do not modify any other app's schema or resources. Known independent app schemas include, but are not limited to:

- `koshora`
- `commercialiq`
- `looply`
- `nocodeml`
- `sussy_baka_detected`
- `ai_research_os`

Likewise, `hub`, `auth`, `storage`, `realtime`, `vault`, `extensions`, `supabase_migrations`, `supabase_functions`, `graphql_public`, `public`, and Postgres/system namespaces are shared or managed infrastructure, not a Skylark workspace.

Shared/system schemas may be inspected read-only when required for verification. They must not be altered from a Skylark app task without explicit user approval after impact review.

## Mandatory checks before any database write

Before creating or changing any Skylark database object:

1. Read `hub.read_me_first`.
2. Confirm both `AGENTS.md` and this file exist in the Skylark repository.
3. Verify a `hub.apps` registry row exists for Skylark Command.
4. Verify the registry row has exactly:
   - `slug = 'skylark_command'`
   - `schema_name = 'skylark_command'`
5. Verify the safety contract is acknowledged by the hub registry.
6. Inspect only `skylark_command.*` and resources registered to the Skylark app.
7. Use fully-qualified `skylark_command.object_name` references in Skylark migrations and DDL/DML.
8. Keep storage/function/RPC names app-prefixed where Project Hub requires naming isolation.
9. Enable and test RLS on every user-facing table where applicable.
10. After meaningful DDL/RLS work, run Supabase security advisors and verify no foreign app object changed.

If any prerequisite is missing or ambiguous, do not write to the database.

## Strictly forbidden

From a normal Skylark task, never:

- create Skylark application tables in `public`
- alter, truncate, delete from, or drop another application's objects
- run `DROP SCHEMA ... CASCADE`
- run unscoped destructive DDL/DML
- disable RLS to bypass authorization problems
- grant blanket privileges across schemas
- modify `auth.users` directly
- change project-wide Auth/OAuth settings for Skylark without an explicit impact review
- rotate project-wide keys for a single app
- commit or expose database passwords, service-role keys, secret keys, or connector credentials
- place a project-level service-role/secret key in frontend/browser code
- create cross-app foreign keys, triggers, RPCs, views, or dependencies without explicit approval
- pause, delete, resize, change region, or change the billing plan of Project Hub
- touch another application's migration/versioning state

## Migration rules

Skylark migrations must be app-scoped. When adapting or applying the canonical Skylark migrations, every application-owned table/index/constraint/function reference must resolve inside `skylark_command` rather than `public` or another app schema.

Current Skylark migration sequence is expected to remain logically ordered as:

```text
001_temporal_intelligence
002_temporal_production_hardening
003_identity_workspace_rbac
```

Before applying them to Project Hub, inspect the SQL and adapt schema qualification safely if needed. Do not run a migration merely because it passed against a dedicated-database assumption.

Migration verification must prove:

- only `skylark_command.*` application objects were created/changed
- no other app schema changed
- no shared project configuration changed
- repeated migration execution behaves as designed
- migration checksum/drift guarantees remain intact

## Credentials and server boundaries

- Keep `DATABASE_URL`, `CRON_SECRET`, monday credentials, Gemini/AI credentials, and any privileged Supabase credential server-only.
- Prefer the least-privileged credentials available for the required runtime path.
- The Project Hub project-level service-role/secret credential is HUB-ADMIN ONLY and must not be treated as an ordinary Skylark application key.
- Public/publishable Supabase keys may be used only where the application design and RLS policies make that access safe.

## Skylark-specific product constraints

- monday.com integration is READ ONLY.
- No arbitrary SQL or GraphQL execution surface may be exposed through Copilot or public APIs.
- Deterministic analytics remain authoritative for business facts.
- Workspace/RBAC isolation must fail closed for authenticated workspace requests.
- Historical data must never be fabricated when snapshots are insufficient.

## Stop condition

If a proposed operation can affect another app, a shared schema, project-wide configuration, credentials, billing, Auth configuration, or any resource whose ownership is unclear: **STOP and ask the user before proceeding.**
