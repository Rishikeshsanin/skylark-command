# Trust Model

Skylark Command treats trust as a product feature, not a disclaimer added after generation.

The system is designed so a user can ask four separate questions:

1. **What is the answer?**
2. **How was it calculated?**
3. **Which source evidence supported it?**
4. **What should I be cautious about?**

## Core invariant

> **The LLM can plan within typed boundaries and interpret an existing result. It cannot become the owner of business arithmetic.**

Pipeline, won value, receivables, counts, rankings, customer contribution, period comparisons, Change Intelligence deltas, and scenario deltas are produced by deterministic code.

## Trust classification

| Class | Meaning | Examples |
| --- | --- | --- |
| **FACT** | Deterministic result from configured source records/snapshots under an explicit metric contract | known open pipeline, Work Order count, exact customer join, snapshot-to-snapshot delta |
| **ESTIMATE** | Deterministic statistical inference using an explicit method | data-distribution materiality threshold or outlier-relative classification |
| **INTERPRETATION** | Optional generated explanation or synthesis over a completed analytical result | executive wording, explanatory summary, follow-up phrasing |

The UI and response contracts should never blur these categories.

## Trust pipeline

```mermaid
flowchart TD
    D[Source data] --> N[Typed normalization]
    N --> A[Deterministic analytics]
    A --> S[Semantic definition]
    S --> L[Answer lineage]
    L --> E[Evidence quality]
    A --> R[Structured answer]
    R --> I[Optional interpretation]
    E --> U[User-visible trust evidence]
    I --> U
    R --> U
```

## 1. Source trust

### monday.com is read-only

The monday.com boundary is server-side and query-oriented. Mutation documents are rejected. Analytical and scenario tools do not expose a source-write capability.

### Temporal snapshots are observations, not invented events

When configured, successful syncs persist point-in-time normalized snapshots to PostgreSQL. Historical analytics query successful snapshots through the temporal-store contract.

If there is not enough history for a requested comparison, Skylark reports that limitation. It does not construct a fake previous week from the current dataset.

Production-hardening code adds migration checksum/drift protection, ordered migrations, bounded PostgreSQL connections, one-active-sync-per-workspace enforcement, abandoned-sync recovery, and last-known-good/freshness behavior. This does **not** mean a production database migration or production cron has already been executed.

## 2. Data-quality trust

Messy operational data is expected.

Normalization follows these rules:

- missing/invalid numeric values → `null`;
- missing/invalid dates → `null`;
- known-only monetary sums do not silently convert nulls to zero;
- quality flags remain attached to records;
- known and unknown value coverage can be surfaced with answers;
- time-scoped analytics exclude records without usable time dimensions and disclose the consequence.

This is why Skylark uses phrases such as **known won value** instead of claiming complete historical revenue when the source is incomplete.

## 3. Metric trust

The semantic layer registers stable metric IDs and dimensions while the analytics layer remains the calculation owner.

Examples include:

- `open_pipeline_value`
- `known_won_value`
- `receivables`
- `open_deal_count`
- `active_work_order_count`

The semantic registry tells the system what a metric means, which dimensions are valid, and which deterministic analytical output owns the value.

## 4. Join trust

Cross-board customer intelligence uses exact equality after deterministic client-code normalization.

The product deliberately rejects fuzzy, embedding-based, edit-distance, or LLM-assisted business joins for authoritative metrics. A wrong join can create a convincing but false customer story, so unmatched keys remain visible instead.

## 5. Identity, workspace, and RBAC trust

Skylark has two access modes:

- **Public demo:** no explicit workspace selector; read-only analytics over the configured demo source.
- **Authenticated workspace:** an explicit workspace selector requires managed-auth identity validation plus an exact active persisted membership.

Supabase Auth can validate the access token, but the canonical authorization role is resolved server-side from `workspace_members`. The application does not trust a client/JWT role claim for RBAC.

Roles are `VIEWER`, `ANALYST`, `ADMIN`, and `OWNER`. Workspace-scoped analytics are executed inside an explicit workspace data scope; if isolated workspace data serving is not configured, the request fails closed rather than falling into public or another workspace. `VIEWER` scenario requests are rejected before scenario execution.

This is a server-side identity/workspace/RBAC foundation. It does not imply that a full frontend login/account-management UI, workspace-specific secret resolution/sync, production tenant onboarding, or deployment-specific enterprise SSO configuration is complete.

## 6. Tool trust

Founder Copilot 2.0 operates over a typed analytical tool surface.

A model proposal must survive all of the following before execution:

1. strict Zod schema validation;
2. allowlisted tool ID validation;
3. source-entity validation;
4. grounding against the current question or structured context;
5. deterministic tool execution.

A tool name such as `runSql`, a monday mutation, or a fabricated customer does not gain authority because it came from a model.

## 7. Conversation trust

Multi-turn context is bounded analytical state rather than a raw transcript becoming a hidden instruction channel.

Context can retain:

- semantic metric ID;
- dimension;
- grounded entity;
- period;
- validated filters;
- previous typed tool call;
- source snapshot reference;
- previous result reference.

Follow-ups such as `Why?`, `Show only deals above ₹1Cr`, or `Compare that with last quarter` therefore operate on explicit state.

## 8. Provider trust and fallback

Gemini is optional.

If configured, it can help with typed planning and qualitative explanation. Provider absence, timeout, malformed output, rate limiting, failed trust guards, or ungrounded parameters must not force the analytics layer to guess.

Fallback behavior preserves deterministic results and uses deterministic planning/wording where supported.

## 9. Prompt-injection boundary

User text and monday-sourced cells are untrusted data.

Security controls include:

- fixed system instructions;
- explicit source-data serialization/delimiting;
- schema validation for generated plans/output;
- source-data instructions treated as content, not commands;
- no arbitrary GraphQL/SQL execution surface for the model;
- safe public errors rather than raw stack/cause serialization.

## 10. Scenario trust

Scenario Lab is a deterministic what-if engine, not a forecasting model.

Safety properties:

- source snapshots are cloned before overrides;
- record IDs must exist;
- IDs/dates/amounts must be grounded;
- receivable payments cannot exceed a known receivable baseline;
- unknown monetary baselines are not fabricated;
- baseline and scenario run the same deterministic analysis;
- delta is computed in code;
- workspace authorization is checked before scenario execution;
- no scenario writes to monday.com.

A scenario answers **“what would this deterministic metric become under these stated assumptions?”** It does not answer **“what is likely to happen?”**

## 11. Evidence quality

Evidence quality is deterministic and descriptive, not an AI confidence score.

The current policy considers factors such as:

- value completeness;
- snapshot freshness;
- exact-join coverage;
- temporal coverage;
- source-quality issues.

A weaker factor can lower the overall evidence class, with a human-readable reason.

## 12. Runtime and observability security boundaries

Current controls include:

- server-only monday.com/database/cron/provider secrets;
- no `NEXT_PUBLIC_` path for those credentials;
- managed-auth token validation for explicit workspace mode;
- persisted membership/RBAC authorization and workspace isolation;
- strict JSON/request validation and request-size limits;
- request IDs and AsyncLocalStorage request context;
- bounded external calls/timeouts;
- safe error envelopes and error taxonomy;
- security headers;
- process-local per-client rate limiting;
- timing-safe `CRON_SECRET` protection for sync and internal diagnostics;
- structured JSON telemetry for request latency, tool/provider behavior, sync lifecycle, database operations, watermark/freshness, and result classification;
- configured secret redaction;
- alert-condition helpers and fixed Copilot evaluation tooling.

The observability contract intentionally excludes full prompt bodies, chain-of-thought, and raw source-record logging. No external observability vendor is mandatory.

### Known production-hardening gaps

The current chat limiter is process-local. On horizontally scaled/serverless deployments, a distributed rate-limit backend would provide stronger global enforcement.

The backend identity/workspace/RBAC foundation is shipped, but full frontend account management, workspace-specific credential resolution/sync, production tenant onboarding, and deployment-specific identity/SSO configuration remain rollout work.

Temporal hardening is implemented in code, but isolated real staging-database validation is still pending. No production migration or production cron activation is claimed.

## 13. What Skylark does not claim

Skylark does **not** currently claim:

- predictive pipeline-conversion ML;
- collections-risk ML;
- delivery-risk ML;
- autonomous write-back to CRM/operations systems;
- fuzzy identity resolution as authoritative truth;
- complete historical business coverage when snapshots are sparse;
- a finished end-user account-management/tenant-onboarding experience;
- production migrations/cron that have not actually been executed.

Predictive models are a future research direction only when enough point-in-time history exists to train and evaluate them defensibly.

## Trust close

The product philosophy can be summarized as:

> **Ask what changed. See why. Verify the evidence. Decide what happens next.**
