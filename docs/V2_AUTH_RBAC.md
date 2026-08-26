# Skylark Command V2 — Authentication, Workspaces & RBAC

## Security model

Skylark supports two deliberate access modes.

### Public demo mode

A request with no `x-skylark-workspace-id` is treated as the portfolio/demo experience.

- no authentication required
- read-only analytics and existing Copilot behavior remain available
- no workspace mutation
- no connector configuration
- no secret access
- no monday.com mutation
- no access to authenticated tenant identifiers

The public demo keeps the existing analytical workspace key `skylark-command`.

### Authenticated workspace mode

A request that explicitly supplies `x-skylark-workspace-id` enters workspace mode.

The server then:

1. validates the workspace identifier;
2. requires a Bearer access token;
3. asks the managed auth provider to validate that token;
4. extracts only the authenticated user identity;
5. loads the exact `(workspace_id, user_id)` membership from PostgreSQL;
6. requires an `ACTIVE` membership;
7. authorizes from the persisted role, never from client/JWT role claims;
8. scopes temporal analytics to the authorized workspace ID.

Authenticated workspace analytics fail closed when `SKYLARK_DATA_MODE=live`. The legacy live monday connector is a single demo source and is never silently reused as tenant data. Workspace analytics therefore require `temporal_preferred` or `temporal_only` plus a workspace-scoped persisted snapshot.

## Managed authentication provider

Identity is delegated to Supabase Auth through the provider-neutral `ManagedAuthProvider` contract.

The current adapter validates a supplied access token against Supabase Auth's authenticated-user endpoint using:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- the caller's `Authorization: Bearer <access-token>` header

Skylark does not store passwords, mint sessions, implement JWT crypto, or infer authorization roles from Supabase user metadata.

A Supabase secret/service-role key is not required by this auth boundary and must never be exposed to browser code.

## Canonical roles

| Role | Analytics | Scenarios | Workspace settings | Connector config | Membership / ownership |
| --- | --- | --- | --- | --- | --- |
| `VIEWER` | Read | No | No | No | No |
| `ANALYST` | Read | Run | No | No | No |
| `ADMIN` | Read | Run | Write | Configure | No |
| `OWNER` | Read | Run | Write | Configure | Manage |

Permissions are intentionally coarse. New permission types should only be added when a concrete server action needs a distinct boundary.

## Workspace persistence

Migration `003_identity_workspace_rbac.sql` adds:

- `workspaces`
- `workspace_members`
- `workspace_connectors`
- `audit_events`

It does not modify or delete migration `001_temporal_intelligence.sql`, and it does not recreate the temporal-production migration owned by `v2/temporal-production`.

Canonical integration order:

1. `001_temporal_intelligence`
2. `002_temporal_production_hardening`
3. `003_identity_workspace_rbac`

This feature branch intentionally contains `001` and `003` only. The canonical `002_temporal_production_hardening.sql` remains owned by the completed `v2/temporal-production` branch and is expected to sit between them after integration.

Existing temporal tables already use `workspace_key`. Authenticated workspace UUIDs are used as that key for scoped analytical reads. No user-controlled workspace identifier reaches temporal serving before membership authorization succeeds.

## Protected server routes

### Public/read-only

- existing dashboard pages
- Customer 360 page
- Change Intelligence page
- `/api/chat` when no workspace header is supplied

These remain usable by portfolio/recruiter visitors.

### Authenticated

`GET /api/auth/session`

- validates the caller's managed-auth access token
- returns identity only; never returns the token

`POST /api/workspaces`

- requires an authenticated session
- creates a workspace
- atomically creates the caller as the first active `OWNER`
- emits `workspace.created`

`PUT /api/workspaces/:workspaceId/members`

- `OWNER` only (`MEMBERSHIP_MANAGE`)
- target user role/status come from a strict validated payload
- caller role always comes from PostgreSQL
- prevents removal/demotion of the last active owner
- emits `workspace.membership.changed`

`PUT /api/workspaces/:workspaceId/connectors/monday`

- `ADMIN` or `OWNER` (`CONNECTOR_CONFIGURE`)
- accepts an opaque credential reference, not a raw token
- rejects secret-like fields recursively inside connector config
- does not return the credential reference in its response
- emits `workspace.connector.changed`

### Infrastructure identity

`GET /api/internal/sync/monday` remains independent of user auth and requires `CRON_SECRET` with timing-safe Bearer comparison. This preserves the existing server/cron trust boundary.

## Copilot authorization

Public demo Copilot remains available.

When `x-skylark-workspace-id` is present, `/api/chat` requires an active workspace membership and runs analytics inside a request-scoped server workspace context. The existing V2 Copilot orchestrator is unchanged.

Role-specific analytical behavior:

- all active roles may read deterministic analytics;
- `runScenario` requires `ANALYST` or higher in authenticated workspace mode;
- Customer 360 and Change Intelligence are read-only analytical tools and remain available to `VIEWER`;
- public demo scenarios remain allowed because they are non-mutating portfolio analysis over the demo dataset.

## Connector credential lifecycle

Skylark stores only a reference such as:

- `env:WORKSPACE_A_MONDAY_TOKEN`
- `vercel:WORKSPACE_A_MONDAY_TOKEN`
- `vault:path/to/credential`
- `secret-manager:project/secret`
- `supabase-vault:workspace-a-monday`

The referenced secret must be resolved only by trusted server/infrastructure code. The current foundation deliberately does not implement secret-manager resolution or workspace-specific monday mutation.

Do not put raw monday tokens, Supabase secret keys, passwords, refresh tokens, or service-role credentials in `workspace_connectors.config`, API responses, browser bundles, logs, or audit metadata.

## Audit foundation

`audit_events` records append-only security/business-control events with optional workspace, actor, target, request ID, metadata, and timestamp.

Current transactional events:

- `workspace.created`
- `workspace.membership.changed`
- `workspace.connector.changed`

Reserved typed events for future flows include:

- `auth.session.verified`
- `scenario.action.approved`

High-frequency analytics reads are intentionally not written to the audit table to avoid turning authorization into excessive event infrastructure. Auth-provider sign-in history remains available at the managed identity provider.

## Threat boundaries

The implementation explicitly defends against:

- anonymous use of workspace-only actions;
- forged role headers/payloads;
- cross-workspace identifiers supplied by a valid user;
- suspended/inactive membership access;
- VIEWER privilege escalation into scenarios or administration;
- ADMIN privilege escalation into membership management;
- last-owner removal;
- raw connector-secret persistence through the configuration API;
- connector-secret response exposure;
- browser imports of server auth/store modules;
- bypass of internal sync infrastructure authentication.

Bearer tokens are transported through the `Authorization` header rather than application auth cookies in this foundation, so workspace API authorization does not rely on spoofable client session objects and does not introduce cookie-CSRF semantics.

## Environment

Required for authenticated workspace mode:

```text
DATABASE_URL
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

Required for internal scheduled monday sync:

```text
CRON_SECRET
MONDAY_API_TOKEN
MONDAY_DEALS_BOARD_ID
MONDAY_WORK_ORDERS_BOARD_ID
```

Workspace-specific analytics additionally require:

```text
SKYLARK_DATA_MODE=temporal_preferred
```

or `temporal_only`, plus snapshots persisted with the workspace UUID as `workspace_key`.

## Migration / deployment safety

This branch only adds the auth/RBAC migration file and migration-runner registration. It does **not** execute migration 003 against any database and does **not** deploy production.

Before integration/deployment:

1. integrate migrations in canonical order: `001_temporal_intelligence`, `002_temporal_production_hardening`, `003_identity_workspace_rbac`;
2. review migration 003;
3. configure Supabase Auth URL/publishable key in the target environment;
4. run `npm run db:migrate` only against the intended database;
5. provision at least one workspace-specific temporal sync path before expecting authenticated workspace analytics;
6. keep public demo mode available without a workspace header.
