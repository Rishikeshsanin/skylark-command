# Skylark Command

### Trust-native executive decision intelligence over live CRM and operational data

**Ask what changed. See why. Verify the evidence. Decide what happens next.**

Skylark Command turns live monday.com Deals and Work Orders into deterministic business analytics, historical change intelligence, Customer 360, scenario analysis, and natural-language decision support. The defining constraint is simple: **AI may interpret an answer, but it does not own the business arithmetic.**

[Live app](https://skylark-command.vercel.app) · [Architecture](docs/ARCHITECTURE.md) · [Trust model](docs/TRUST_MODEL.md) · [90-second demo](docs/DEMO.md) · [Technical case study](docs/CASE_STUDY.md)

> The public deployment can lag the repository's V2 branch. Before demonstrating historical Change Intelligence or Scenario Lab, verify that the deployed SHA includes those capabilities and that temporal storage is configured. No mock history is used as a substitute.

## Why it is different

Most conversational BI demos optimize for fluent answers. Skylark Command optimizes for **defensible answers**.

| Principle | Product behavior |
| --- | --- |
| **Deterministic truth** | TypeScript owns normalization, filters, joins, rankings, deltas, and business arithmetic. |
| **Explicit semantics** | A versioned semantic registry defines metrics, dimensions, allowed joins, and canonical questions. |
| **Evidence before confidence** | Answers can carry source snapshots, record IDs, coverage, lineage, caveats, and evidence-quality classifications. |
| **Time is first-class** | Persisted point-in-time snapshots support change detection without reconstructing or fabricating history. |
| **AI is bounded** | Gemini can propose typed analytical tools and explain computed results; schema, grounding, and allowlists constrain execution. |
| **Unknown stays unknown** | Missing values remain `null`; known-only totals disclose coverage rather than treating missing data as zero. |
| **Scenarios are isolated** | What-if overrides run against cloned snapshots and never mutate monday.com source records. |
| **Workspace access is server-owned** | Public demo mode is read-only; explicit workspace mode validates managed identity and persisted membership/RBAC before analytics. |
| **Operations are observable without logging business content** | Request IDs, structured JSON telemetry, safe error taxonomy, sync/tool/provider signals, protected diagnostics, alerts, and fixed Copilot evaluations are implemented in-process. |

## What it can do

### Founder Copilot 2.0

Ask business questions in natural language, continue with structured follow-ups, and receive answers backed by approved analytical tools. The Copilot supports pipeline, sector/stage analysis, customer contribution, Customer 360, receivables, Work Order health, period comparisons, Change Intelligence, and Scenario Lab.

### Change Detective

Compare available point-in-time snapshots to answer questions such as `What changed since last week?`, `What changed in pipeline?`, or `Which customers changed the most?`. When durable history is unavailable or too sparse, the product says so instead of inventing a comparison baseline.

### Customer 360

Join commercial and operational evidence using an exact normalized client key. Inspect pipeline exposure, won-value evidence, Work Orders, billing/collections context, receivables, execution risk, and contribution without fuzzy identity matching.

### Scenario Lab

Run bounded what-if analysis such as moving a Deal close period, changing an outcome, applying a receivable payment, delaying a Work Order, or resolving an operational item. Every scenario follows:

`immutable baseline + validated overrides → cloned hypothetical snapshot → same deterministic analytics → BASELINE / SCENARIO / DELTA`

### Evidence-first executive UI

Overview, Pipeline, Operations, Leadership, Data Health, Change Detective, Customer 360, and Founder Copilot use responsive visualizations, freshness/coverage signals, explicit caveats, and evidence surfaces rather than hiding data quality behind prose.

## Why the answers are trustworthy

Skylark separates three classes of output:

- **FACT** — deterministic analytics computed from configured source records and persisted snapshots.
- **ESTIMATE** — explicitly labeled statistical techniques, such as materiality thresholds derived from observed data distributions.
- **INTERPRETATION** — optional LLM wording over an already-computed analytical result.

The LLM is not allowed to silently promote an interpretation into a fact. See the full [Trust Model](docs/TRUST_MODEL.md).

```mermaid
flowchart LR
    U[Executive question] --> P[Typed planner]
    P --> G{Schema + grounding + allowlist}
    G -->|approved| T[Deterministic analytical tool]
    G -->|invalid / unsupported| C[Clarify or deterministic fallback]
    S[Live or persisted source snapshot] --> T
    T --> A[Authoritative structured answer]
    T --> E[Lineage + evidence quality]
    A --> L[Optional LLM interpretation]
    E --> UI[Evidence-first UI]
    L --> UI
    A --> UI
```

## Architecture

```mermaid
flowchart TD
    M[monday.com GraphQL<br/>read-only] --> N[Normalization + quality flags]
    N --> L[Live analytical snapshot]
    N --> SYNC[Authenticated temporal sync]
    SYNC --> PG[(PostgreSQL point-in-time snapshots)]
    L --> A[Deterministic analytics]
    PG --> H[Historical snapshot provider]
    H --> CI[Change Intelligence]
    A --> SEM[Semantic registry + lineage]
    CI --> SEM
    SEM --> TOOLS[Typed analytical tool registry]
    ID[Managed auth + workspace membership/RBAC] --> TOOLS
    TOOLS --> C[Founder Copilot 2.0]
    TOOLS --> SC[Scenario Lab]
    TOOLS --> UI[Executive product surfaces]
    C --> UI
    SC --> UI
    OBS[Request context + structured telemetry] -. observes .-> C
    OBS -. observes .-> SYNC
```

Detailed component boundaries, temporal flow, workspace isolation, observability, and failure behavior are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Product surfaces

| Route | Purpose |
| --- | --- |
| `/` | Executive overview and Founder Attention |
| `/changes` | Change Detective over available historical snapshots |
| `/copilot` | Founder Copilot 2.0, structured answers, trust trace, and Scenario Lab |
| `/customers/[clientKey]` | Customer 360 |
| `/pipeline` | Pipeline, stage/sector and risk intelligence |
| `/operations` | Work Order, billing, collections, and receivables health |
| `/leadership` | Deterministic Leadership Brief |
| `/data-health` | Missing, malformed, unmapped, stale, and coverage evidence |
| `/api/chat` | Canonical Copilot API with public-demo/workspace authorization |
| `/api/health` | Configuration-safe health metadata |
| `/api/internal/sync/monday` | `CRON_SECRET`-protected temporal snapshot sync endpoint |
| `/api/internal/diagnostics` | `CRON_SECRET`-protected operational diagnostics |

## Tech stack

| Layer | Technology |
| --- | --- |
| Web application | Next.js 16 App Router, React 19, TypeScript 5.9 |
| Validation | Zod |
| Source integration | monday.com GraphQL over server-side `fetch` |
| Temporal storage | PostgreSQL via `postgres` |
| Managed identity validation | Supabase Auth access-token validation with persisted server-side workspace membership/RBAC |
| AI interpretation/planning | Google Gemini, optional and server-only |
| Styling | Tailwind CSS 4 plus application CSS |
| Tests | Node test runner via `tsx`, Vitest, fixed Copilot evaluation suite |
| Hosting target | Vercel / Node.js 24.x runtime |

No technology is listed here unless it exists in the repository or runtime contract.

## Data and trust pipeline

1. **Fetch** configured monday.com boards server-side using paginated, query-only GraphQL.
2. **Normalize** source cells into typed Deals and Work Orders; malformed or missing values remain explicit.
3. **Authorize** public read-only demo access or an explicit authenticated workspace using server-resolved membership/RBAC.
4. **Serve** either live data or a successful workspace-scoped temporal snapshot according to `SKYLARK_DATA_MODE`.
5. **Persist** successful point-in-time snapshots when temporal sync is configured.
6. **Calculate** business metrics in deterministic analytics functions.
7. **Describe** those metrics through the semantic registry instead of redefining arithmetic in the AI layer.
8. **Execute** only typed, allowlisted analytical tools.
9. **Attach** lineage, source references, filters, evidence coverage, and caveats.
10. **Interpret** optionally with Gemini after authoritative data exists.
11. **Observe** request/tool/provider/sync outcomes with structured redacted telemetry rather than prompt or raw-record logging.
12. **Render** the structured result and its trust evidence in the UI.

## Security boundaries

- Server-only monday.com, database, cron, and Gemini credentials.
- Managed-auth validation for explicit workspace mode; canonical roles come from persisted `workspace_members`, not client/JWT role claims.
- Public demo mode remains accessible and read-only; authenticated workspace requests are isolated and fail closed when workspace data serving is not configured.
- `VIEWER` can run authorized analytics but is denied Scenario Lab before scenario execution; higher permissions are server-owned.
- monday.com client rejects mutation documents and uses query-only access patterns.
- Strict request schemas, bounded body/message sizes, request IDs, safe public errors, and timeouts.
- Prompt-injection defenses separate user/source data from system instructions.
- LLM tool proposals must pass Zod validation, allowlist checks, source-entity grounding, and context grounding.
- Provider failure degrades interpretation, not deterministic analytics.
- Scenario analysis operates on cloned data and has no source-write path.
- Structured telemetry redacts configured secrets and never logs full prompts, chain-of-thought, or raw source records.
- Internal sync and diagnostics routes are protected by timing-safe `CRON_SECRET` bearer validation.
- Current rate limiting is process-local; distributed enforcement remains a production-hardening item.

See [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) and [docs/RELEASE.md](docs/RELEASE.md).

## Testing and quality gates

The repository uses separate deterministic analytics, temporal/history, migration-hardening, workspace/RBAC, Change Intelligence, Customer 360, customer-contribution, semantic-layer, Copilot, evaluation, injection/security, observability, visualization, and server-reliability tests. Rather than pinning a test count that will become stale, the release gate is defined by commands:

```bash
npm ci
npm run eval:copilot
npm test
npm run lint
npm run build
```

A release candidate should also pass route/API smoke checks, tracked-secret review, and a live-source sanity check where credentials are available. See [docs/RELEASE.md](docs/RELEASE.md).

## Local setup

Requires Node.js 24.x, matching the repository runtime contract.

```bash
git clone https://github.com/Rishikeshsanin/skylark-command.git
cd skylark-command
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Minimal live-data configuration:

```dotenv
MONDAY_API_TOKEN=<server-side token>
MONDAY_DEALS_BOARD_ID=<deals board id>
MONDAY_WORK_ORDERS_BOARD_ID=<work-orders board id>
```

Temporal history is optional for the public demo. Explicit authenticated workspace analytics require isolated temporal data serving. When temporal mode is enabled, configure `DATABASE_URL`, `CRON_SECRET`, and the data-mode settings; managed identity validation uses `SUPABASE_URL` plus `SUPABASE_PUBLISHABLE_KEY`. See [Deployment](docs/DEPLOYMENT.md).

## Production-hardening status

Implemented in code on V2:

- temporal migration checksum/drift validation, bounded PostgreSQL connections, active-sync enforcement, abandoned-sync recovery, last-known-good serving, and truthful freshness;
- server-side managed-auth foundation, workspaces, memberships, `OWNER` / `ADMIN` / `ANALYST` / `VIEWER` RBAC, public-demo/authenticated-workspace modes, connector credential-reference model, and audit foundation;
- structured logging, AsyncLocalStorage request context, request IDs, latency/tool/provider/sync telemetry, error taxonomy, secret redaction, protected diagnostics, alert conditions, and fixed Copilot evaluation tooling;
- deterministic responsive INR presentation, mobile interaction targets, focus/scroll behavior, and reduced-motion handling.

Not claimed as shipped:

- full frontend login/account-management UI;
- workspace-specific secret resolution/sync and production tenant onboarding;
- a production migration execution or activated production cron;
- real historical accumulation in an environment that has not yet captured multiple successful snapshots.

An isolated real staging database migration validation is still required before production temporal rollout.

## Demo

The recommended recruiter/product walkthrough is intentionally short:

1. Open Overview and explain the trust-native thesis.
2. Ask `What changed since last week?`.
3. Open the answer evidence/lineage.
4. Inspect one customer in Customer 360.
5. Ask which customers contributed to a result.
6. Run a bounded scenario.
7. Close with Data Health and FACT / ESTIMATE / INTERPRETATION.

If the deployed environment does not have enough historical snapshots, use the documented alternate path instead of pretending that history exists. See [docs/DEMO.md](docs/DEMO.md).

## Screenshots

The existing `Screenshots/` directory is preserved as a real production reference from the earlier public deployment. It is **not** labeled as proof of every V2 capability.

A V2 gallery is intentionally gated on real V2 captures. The exact capture checklist and filenames live in [docs/screenshots/README.md](docs/screenshots/README.md).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Trust Model](docs/TRUST_MODEL.md)
- [Demo Script](docs/DEMO.md)
- [Technical Case Study](docs/CASE_STUDY.md)
- [Data Contracts](docs/DATA_CONTRACTS.md)
- [Semantic Layer](docs/SEMANTIC_LAYER.md)
- [Copilot & Scenario Lab](docs/V2_COPILOT_SCENARIO.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Release & Quality Gates](docs/RELEASE.md)
- [Roadmap](docs/ROADMAP.md)
- [Portfolio / Resume Notes](docs/PORTFOLIO.md)
- [Decision Log](docs/DECISION_LOG.md)
- [Observability](docs/OBSERVABILITY.md)
- [Auth / RBAC](docs/V2_AUTH_RBAC.md)
- [Temporal Production Readiness](docs/TEMPORAL_PRODUCTION_READINESS.md)

## Roadmap snapshot

**Shipped in code:** deterministic executive analytics, live monday.com integration, hardened temporal snapshot infrastructure, Change Intelligence, Customer 360, semantic lineage/evidence, typed Copilot tools, Scenario Lab, Data Health, responsive visualizations, provider fallback, server-side workspace/RBAC foundation, and structured observability/evaluation tooling.

**Next:** isolated real staging migration validation, operationalize scheduled snapshot capture without enabling production cron prematurely, workspace-specific secret resolution/onboarding, distributed rate limiting, stronger evidence navigation, and a clean V2 screenshot/demo set.

**Future / research:** pipeline conversion, collections risk, and delivery-risk prediction **only after sufficient point-in-time historical data exists for defensible training and evaluation**. No predictive ML model is claimed as shipped today.

---

### Product philosophy

> **Ask what changed. See why. Verify the evidence. Decide what happens next.**
