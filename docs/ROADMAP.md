# Roadmap

Skylark Command's roadmap is organized by evidence, not hype. Capabilities move from research to product only when the underlying data and reliability contracts are strong enough to support them.

## Shipped in code

### Trust-native analytical foundation

- Live, read-only monday.com Deals and Work Orders integration.
- Typed normalization with explicit null/quality handling.
- Deterministic pipeline, won-value, period, operations, receivables, ranking, risk, and leadership analytics.
- Exact normalized customer joins.
- Data Health and known/unknown coverage.

### Temporal intelligence and production hardening

- PostgreSQL temporal snapshot schema/store.
- Successful-sync tracking and source watermarks.
- Configurable live / temporal-preferred / temporal-only serving modes.
- Historical snapshot provider with sparse-history behavior.
- Change Intelligence for pipeline, customers, and receivables.
- Change Detective product surface.
- Migration checksum persistence and drift rejection.
- Ordered `001_temporal_intelligence` → `002_temporal_production_hardening` → `003_identity_workspace_rbac` migration discovery.
- Historical indexes and latest-successful snapshot lookup.
- Bounded serverless database connections.
- One-active-sync-per-workspace enforcement and abandoned-sync recovery.
- Original sync-error preservation and last-known-good/freshness behavior.

The hardening exists in code. An isolated real staging database still needs validation before production temporal rollout; no production migration or production cron is claimed as executed.

### Identity, workspaces, and RBAC foundation

- ManagedAuthProvider and Supabase Auth token validation.
- Workspace, WorkspaceMember, WorkspaceConnector, and audit-event persistence contracts.
- `OWNER`, `ADMIN`, `ANALYST`, `VIEWER` server-owned RBAC.
- Public read-only demo mode when no explicit workspace selector is supplied.
- Authenticated explicit-workspace mode with exact active membership authorization.
- Workspace data-scope isolation and fail-closed behavior when workspace serving is not configured.
- `VIEWER` scenario denial before scenario execution.

This is a backend foundation. A full frontend login/account-management experience, workspace-specific secret resolution/sync, and production tenant onboarding are not claimed as shipped.

### Observability and reliability

- Structured JSON server logging.
- AsyncLocalStorage request/workspace/sync context.
- Request ID preservation/generation.
- Request, tool, provider, database, and sync latency/outcome telemetry.
- Error taxonomy and safe public-error separation.
- Secret redaction with no prompt, chain-of-thought, or raw-source-record logging.
- `CRON_SECRET`-protected internal diagnostics.
- Conservative alert-condition helpers.
- Fixed Copilot evaluation runner and `npm run eval:copilot`.

No external observability vendor is required; the current event contract can be consumed by one later.

### Customer intelligence

- Customer 360 across commercial and operational data.
- Deterministic customer contribution under validated filters.
- Exact provenance and unmatched-customer handling.

### Applied AI orchestration

- Founder Copilot 2.0.
- Typed Zod analytical tool contracts.
- Allowlist and source/context grounding.
- Structured multi-turn analytical context.
- Optional Gemini planning/interpretation.
- Deterministic fallback behavior.
- Prompt-injection and untrusted-source-data separation.

### Scenario intelligence

- Immutable scenario baseline.
- Validated Deal / Work Order overrides.
- Same deterministic analytics for baseline and scenario.
- Deterministic BASELINE / SCENARIO / DELTA output.
- Workspace permission check before scenario execution.
- No source write-back path.

### Product experience

- Executive Overview and Founder Attention.
- Pipeline and Operations surfaces.
- Leadership Brief.
- Data Health.
- Change Detective.
- Customer 360.
- Evidence-first Copilot output.
- Responsive data visualizations.
- Deterministic hydrated INR formatting.
- >=44px mobile interaction targets where hardened.
- Nested Jump-to-latest, focus restoration, sticky-composer clearance, and reduced-motion behavior.

## Next

These items operationalize the shipped foundations without changing the trust model.

### Validate and operationalize temporal capture

- Validate all migrations against an isolated real staging PostgreSQL database.
- Configure a real scheduled caller for `/api/internal/sync/monday` only after that validation.
- Establish retention/backup policy for analytical snapshots.
- Validate snapshot cadence/freshness in the intended hosting plan.
- Keep production cron disabled until rollout is explicitly approved.

### Workspace productization

- Build the frontend login/account-management experience.
- Implement workspace-specific credential/secret resolution for source sync.
- Add production tenant onboarding and deployment-specific identity/SSO configuration where required.
- Expand audit administration/reporting surfaces.

### Runtime hardening

- Replace process-local rate limiting with a distributed backend.
- Connect the existing structured event contract to a selected log/alert destination if operational needs justify it.
- Validate operational thresholds with real traffic rather than changing semantics to fit dashboards.

### Evidence navigation

- Make source snapshot IDs and record-level lineage easier to traverse from every material answer.
- Improve comparison views between baseline/current records.
- Standardize FACT / ESTIMATE / INTERPRETATION labels across all surfaces.

### Scenario productization

- Persist named scenario definitions separately from source truth.
- Add scenario versioning and reproducible shareable assumptions.
- Expand comparison visualizations while keeping scenario arithmetic deterministic.

### Portfolio assets

- Capture a clean real V2 screenshot gallery.
- Record a short V2 demo using a deployment with sufficient historical snapshots.
- Keep public documentation synchronized with deployed capabilities.

## Future / research

These directions require enough point-in-time historical evidence to train and evaluate models honestly.

### Pipeline conversion modeling

Potential goal: estimate the probability that an open Deal converts within a defined horizon.

Prerequisites:

- sufficient timestamped Deal snapshots;
- leakage-safe outcome labels;
- stable feature definitions;
- time-based validation;
- calibration and cohort analysis;
- comparison with simple non-ML baselines.

### Collections risk

Potential goal: estimate delayed/non-collection risk using historical billing, receivable, customer, and Work Order behavior.

Prerequisites include reliable collection timestamps, consistent receivable histories, and enough positive/negative examples.

### Delivery risk

Potential goal: estimate Work Order delay/escalation risk from historical execution-state evolution.

Prerequisites include stable delivery milestones, point-in-time status sequences, and enough completed outcomes.

### Learned anomaly/change prioritization

Current Change Intelligence can use explicit deterministic/statistical materiality logic. Learned prioritization may be explored only after there is enough history to evaluate false positives/negatives and drift.

## Research guardrails

Predictive models are not considered shipped until they have:

1. documented labels and feature provenance;
2. sufficient historical coverage;
3. time-based train/validation/test splits;
4. strong non-ML baselines;
5. calibration/error analysis;
6. drift monitoring plan;
7. a clear UI distinction between prediction and observed fact.

Until those conditions exist, Skylark will prefer deterministic rules, explicit statistics, and scenario analysis over unsupported ML claims.
