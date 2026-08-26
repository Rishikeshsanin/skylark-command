# AGENTS.md — Skylark Command

This repository is an application inside a shared Supabase **Project Hub**. Any agent, automation, script, migration, or developer operation that touches Supabase or PostgreSQL must follow the isolation contract below.

## Canonical application scope

- Application: **Skylark Command**
- App slug: `skylark_command`
- Assigned database schema: `skylark_command`
- Repository: `https://github.com/Rishikeshsanin/skylark-command`

Before any Supabase/database operation, read `SUPABASE_HUB_RULES.md` in this repository and the Project Hub control-plane guidance in `hub.read_me_first`.

## Non-negotiable database boundary

Skylark owns only objects explicitly registered for the `skylark_command` app and, for application tables/views/functions, only objects under:

```text
skylark_command.*
```

Use fully-qualified `schema.object` names for every Skylark DDL/DML statement.

Never create Skylark application tables in `public`.
Never modify another application's schema or resources.
Never create cross-app foreign keys or dependencies without explicit user approval.
Never rely on unqualified `search_path` resolution for destructive or schema-changing operations.

## Forbidden actions

Unless the user gives explicit project-wide approval after an impact review, do not:

- run `DROP SCHEMA ... CASCADE`
- run unscoped `DROP`, `TRUNCATE`, `DELETE`, or `ALTER`
- modify another app schema
- modify `auth.users` directly
- disable RLS as a shortcut
- grant blanket privileges across schemas
- rotate project-wide Supabase keys
- change project-wide Auth/OAuth configuration for this app
- expose or commit database passwords, secret keys, or service-role keys
- use a project-level service-role/secret key in browser/frontend code
- pause, delete, resize, change region, or change plan for Project Hub
- create cross-app RPCs, foreign keys, triggers, or storage dependencies without explicit approval

If an operation may affect another application or shared Supabase infrastructure, **stop and ask the user before writing**.

## Shared/system schemas

Schemas such as `hub`, `auth`, `storage`, `realtime`, `vault`, `extensions`, `supabase_migrations`, `supabase_functions`, `graphql_public`, and other Supabase/Postgres system namespaces are shared infrastructure. They may be inspected read-only when necessary for verification, but must not be modified from an ordinary Skylark app task unless explicitly approved and impact-reviewed.

## Required workflow before any Skylark database write

1. Confirm `SUPABASE_HUB_RULES.md` exists and has been read.
2. Verify the Skylark app exists in `hub.apps`.
3. Verify `slug = 'skylark_command'`.
4. Verify `schema_name = 'skylark_command'`.
5. Verify the app safety contract is acknowledged in the hub registry.
6. Inspect only `skylark_command.*` and Skylark-registered resources.
7. Scope every migration/DDL/DML statement to `skylark_command.*`.
8. Enable and test RLS on every user-facing table where applicable.
9. Keep app-owned resource names Skylark-prefixed where Project Hub requires it.
10. After meaningful DDL/RLS changes, run the Supabase security advisor and verify that no object belonging to any other app changed.

## Repository and runtime safety

- Do not commit real secrets.
- Keep database credentials server-only.
- Do not weaken auth/RBAC, temporal-history, evidence, or observability boundaries to make integration easier.
- `monday.com` access from Skylark remains **READ ONLY**. Do not add monday mutations.
- Do not let the LLM calculate authoritative business metrics; deterministic analytics remain the source of truth.

When in doubt, choose isolation over convenience.
