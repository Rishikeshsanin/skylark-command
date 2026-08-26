# Architecture

Skylark Command is a trust-native executive decision intelligence platform. Its architecture is designed around one invariant: **business truth must be deterministic, inspectable, and separable from generated interpretation.**

## System at a glance

```mermaid
flowchart TD
    M[monday.com GraphQL<br/>read-only] --> F[Server-side fetch + pagination]
    F --> N[Normalization + quality flags]
    N --> LIVE[Live analytical snapshot]
    N --> SYNC[Authenticated snapshot sync]
    SYNC --> PG[(PostgreSQL temporal store)]

    LIVE --> ANALYTICS[Deterministic analytics]
    PG --> HISTORY[Historical snapshot provider]
    HISTORY --> CHANGE[Change Intelligence]
    LIVE --> C360[Customer 360]

    ANALYTICS --> SEM[Semantic registry]
    CHANGE --> SEM
    C360 --> SEM

    SEM --> TOOLS[Typed analytical tool registry]
    TOOLS --> COPILOT[Founder Copilot 2.0]
    TOOLS --> SCENARIO[Scenario Lab]

    COPILOT --> UI[Evidence-first product surfaces]
    SCENARIO --> UI
    ANALYTICS --> UI
```

## Architectural layers

### 1. Source integration

`src/lib/monday/**` is the live source boundary.

- Server-only credentials.
- Paginated GraphQL reads.
- `cache: "no-store"` for source fetches.
- Explicit mutation rejection.
- Typed mapping into source records before normalization.

The application does not embed a spreadsheet export as runtime truth.

### 2. Normalization

`src/lib/normalization/**` converts messy source values into typed `Deal` and `WorkOrder` records.

Important rules:

- Missing or malformed values become `null`, not guessed values.
- Currency semantics preserve source field meaning, including GST-inclusive versus GST-exclusive fields.
- Client keys are normalized deterministically for known formats.
- Unknown client formats are not fuzzily merged.
- Quality flags remain attached to normalized records.

This layer is intentionally boring: deterministic data preparation is easier to test, audit, and reason about than model-assisted cleanup.

### 3. Live and temporal data serving

`src/lib/data-platform/**` adds point-in-time history without forcing every deployment to use a database.

The serving mode is controlled by `SKYLARK_DATA_MODE`:

- `live` — fetch current monday.com data.
- `temporal_preferred` — serve the latest successful temporal snapshot when available, with live fallback according to the serving contract.
- `temporal_only` — require temporal storage.

Successful syncs can persist normalized snapshots into PostgreSQL through `PostgresTemporalSnapshotStore`. Snapshot queries are workspace-scoped, time-bounded, deterministic, and restricted to snapshots associated with successful sync runs.

No synthetic historical records are generated when durable history is missing.

## Temporal data flow

```mermaid
sequenceDiagram
    participant Scheduler
    participant SyncAPI as /api/internal/sync/monday
    participant Monday as monday.com
    participant Normalize as Normalization
    participant PG as PostgreSQL
    participant Product as Skylark analytics

    Scheduler->>SyncAPI: GET + Bearer CRON_SECRET
    SyncAPI->>Monday: Read Deals + Work Orders
    Monday-->>SyncAPI: Source records
    SyncAPI->>Normalize: Parse + normalize + quality flags
    Normalize-->>SyncAPI: BusinessDataSnapshot
    SyncAPI->>PG: Persist successful point-in-time snapshot
    PG-->>SyncAPI: snapshot id / watermark
    Product->>PG: Query successful snapshots
    PG-->>Product: Ordered historical snapshots
```

A snapshot is an observation of source state at a particular time. It is not an event log and it does not imply that every underlying change happened exactly at the capture timestamp.

### 4. Deterministic analytics

`src/lib/analytics/**` owns business calculation.

Responsibilities include:

- open pipeline and won-value analytics;
- stage/sector breakdowns;
- period analysis;
- Work Order execution and receivables health;
- customer rankings and contribution;
- Founder Attention;
- Customer 360;
- Change Intelligence;
- data quality;
- deterministic scenario re-runs and deltas.

Time-dependent analytics accept an explicit analysis date where required so tests do not depend on wall-clock behavior.

### 5. Semantic registry and lineage

`src/lib/semantic/**` describes what a metric means and how an answer was formed. It does **not** replace the analytics layer.

The registry captures:

- canonical metric IDs;
- dimensions;
- compatible filters;
- exact join definitions;
- metric versions;
- answer lineage;
- known/unknown value coverage;
- evidence-quality factors;
- source snapshot metadata.

This allows the product to answer both `What is the number?` and `Why should I trust this number?` using deterministic contracts.

### 6. Typed analytical tools

Founder Copilot does not receive arbitrary database or source-system capabilities. It selects from Zod-validated tool contracts such as:

- pipeline summary / by sector / by stage;
- customer contribution;
- Change Intelligence;
- Customer 360;
- receivables;
- Work Order health;
- period comparison;
- Scenario Lab.

Tool proposals are checked against an allowlist plus source/context grounding. A schema-valid but invented customer, sector, record ID, date, or amount is not automatically trusted.

### 7. Founder Copilot 2.0

The Copilot has two planning paths:

1. optional provider planning for natural-language flexibility;
2. deterministic fallback planning.

Both paths converge on the same typed tool registry. Provider absence or invalid output therefore affects language flexibility, not ownership of business truth.

Structured conversation context stores bounded analytical state—metric, dimension, entity, period, validated filters, previous tool call, snapshot reference—rather than handing the full prior conversation back as an untrusted instruction blob.

## Copilot trust flow

```mermaid
flowchart LR
    Q[Question] --> P[Planner proposal]
    P --> Z[Zod tool schema]
    Z --> A[Allowlist]
    A --> G[Entity + parameter grounding]
    G --> T[Deterministic tool execution]
    T --> R[Authoritative structured result]
    T --> E[Evidence + lineage + caveats]
    R --> X[Optional interpretation]
    X --> V[UI]
    R --> V
    E --> V
    P -. invalid .-> F[Deterministic fallback / clarification]
```

### 8. Scenario Lab

Scenario Lab is intentionally not a predictive model.

A scenario applies validated overrides to an immutable clone, reruns the same deterministic analysis used for the baseline, and computes deltas deterministically.

Examples include:

- moving a Deal close period/date;
- changing Deal outcome or inclusion;
- applying a receivable payment;
- setting a collection amount;
- delaying or resolving a Work Order.

There is no monday.com mutation path in the scenario engine.

### 9. Evidence-first UI

The UI surfaces analysis rather than hiding it behind chat text. Product components include:

- Overview / Founder Attention;
- Pipeline and Operations dashboards;
- Leadership Brief;
- Change Detective;
- Customer 360;
- Data Health;
- structured Copilot answers;
- charts for distributions, trends, financial flows, and deltas;
- source freshness, coverage, caveats, and evidence drawers.

## FACT, ESTIMATE, INTERPRETATION

Skylark separates analytical truth by provenance rather than presenting every output as equally certain.

### FACT

A deterministic result derived directly from configured source data or persisted snapshots under a defined metric contract.

Examples: known open pipeline, known receivables, record counts, exact client matches, a before/after delta between two captured snapshots.

### ESTIMATE

A deterministic statistical result that depends on a documented method or threshold rather than a directly stored business value.

Example: a materiality classification derived from distribution-aware statistics such as median/MAD logic.

An estimate is still reproducible, but its method must be visible.

### INTERPRETATION

Natural-language explanation, prioritization wording, or synthesis generated after the analytical result exists.

Interpretation is useful for decision support but does not overwrite FACT or ESTIMATE values.

## Failure model

The system prefers an explicit partial answer or limitation over a fabricated complete answer.

| Failure | Expected behavior |
| --- | --- |
| Gemini unavailable | Preserve deterministic analytics; use fallback wording. |
| Invalid tool proposal | Reject, clarify, or use deterministic planner. |
| Unknown customer/sector | Fail closed with no-match behavior. |
| Missing value | Preserve `null` / known-only coverage. |
| No historical snapshot | Report insufficient history; do not synthesize one. |
| Temporal store unavailable in live mode | Continue live according to serving mode. |
| Unsafe source mutation request | Not supported by the analytical tool surface. |
| Scenario override exceeds known baseline | Reject the override. |

## Key directories

| Path | Responsibility |
| --- | --- |
| `src/lib/monday` | Source access |
| `src/lib/normalization` | Typed normalization |
| `src/lib/data-platform` | Temporal persistence and serving |
| `src/lib/analytics` | Deterministic business logic |
| `src/lib/semantic` | Definitions, lineage, evidence quality |
| `src/lib/agent/v2` | Typed orchestration and scenarios |
| `src/components/change-intelligence` | Change Detective UI |
| `src/components/customers` | Customer 360 UI |
| `src/components/copilot` | Founder Copilot UI |
| `tests` / `*.test.ts` | Analytics, temporal, trust, security, and UI regression tests |

## Design consequence

The architecture intentionally contains more explicit contracts than a simple chat-over-API demo. That extra structure is the product: it makes an executive answer reproducible, traceable, and safe to challenge.
