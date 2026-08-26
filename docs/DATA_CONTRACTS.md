# Data & Analytics Contracts

This document summarizes the invariants shared by source ingestion, deterministic analytics, semantic evidence, Copilot tools, and product surfaces.

## Canonical modules

- Domain types: `src/types`
- Live source loader: `src/lib/business-data`
- monday.com boundary: `src/lib/monday`
- Normalization: `src/lib/normalization`
- Temporal platform: `src/lib/data-platform`
- Deterministic analytics: `src/lib/analytics`
- Semantic definitions/evidence: `src/lib/semantic`
- Typed Copilot tools: `src/lib/agent/v2`

## Core rules

1. `Deal` and `WorkOrder` use `null` for missing or invalid source values.
2. Missing money is not silently replaced by zero.
3. Currency field names preserve source meaning, including GST-inclusive versus GST-exclusive values.
4. `normalizedClientKey` is the canonical cross-board customer key.
5. Known client-code variants are normalized deterministically; unknown formats are not fuzzily merged.
6. monday.com source access is server-only and query-oriented.
7. Business arithmetic remains in pure/deterministic analytics functions.
8. Time-dependent calculations receive explicit analysis-time inputs where required.
9. Temporal snapshots represent captured point-in-time source state, not reconstructed events.
10. Semantic/AI layers may select, annotate, or explain analytics but must not create competing arithmetic definitions.

## Important metric semantics

### Open pipeline

Known Deal value for records whose normalized status is open according to the canonical analytics contract. Missing Deal values remain unknown and are excluded from known-only value sums.

### Known won value

Sum of known Deal values for won Deals. This metric must not be described as complete historical revenue when source Deal values are missing.

### Receivables

Uses the source Work Order `Amount Receivable` field under the deterministic analytics contract; no LLM-derived receivable formula is substituted.

### Active Work Orders

Uses normalized execution-status semantics from deterministic Work Order analytics.

### Period analytics

Deal period uses canonical date-selection/quarter logic from `src/lib/analytics/periods.ts`. Records without a usable period date are excluded from period analysis and should contribute to caveats/coverage rather than being assigned a guessed date.

A period with no usable observations is not a zero-performance result.

## Customer identity contract

Cross-board intelligence joins:

`Deal.normalizedClientKey == WorkOrder.normalizedClientKey`

after deterministic normalization.

Authoritative joins do not use:

- fuzzy string similarity;
- edit distance;
- embeddings;
- model-assisted entity guesses.

Unmatched customers remain explicit.

## Customer analytics

The deterministic analytics layer supports customer ranking/intelligence including:

- won-value contribution;
- open-pipeline contribution;
- Work Order execution health;
- combined commercial/operational exposure indicators;
- Customer 360;
- filtered customer-contribution questions.

Where a ranking definition is ambiguous, the product should require or infer only an explicitly supported metric/definition.

## Historical snapshots

The temporal data platform stores normalized analytical snapshots associated with sync runs.

Historical queries must:

- be workspace-scoped;
- use bounded time/result ranges;
- return only snapshots associated with successful sync runs;
- preserve snapshot/source timestamps;
- avoid generating missing snapshots.

Change Intelligence consumes actual available snapshots and keeps sparse-history limitations visible.

## Change Intelligence

Change results can contain both directly observed deterministic deltas and explicitly statistical materiality assessments.

Trust classification:

- direct source/snapshot arithmetic → **FACT**;
- explicit statistical materiality methods → **ESTIMATE**;
- generated explanation → **INTERPRETATION**.

The generated layer does not calculate the underlying change delta.

## Scenario contract

Scenario analysis uses a cloned `BusinessDataSnapshot`.

Supported override families include Deal date/period/outcome/inclusion changes and Work Order collection/receivable/execution changes.

Rules include:

- referenced IDs must exist;
- free-form scenario parameters must be grounded;
- receivable payments cannot exceed known baseline receivables;
- unknown monetary baselines are not fabricated;
- the baseline and scenario execute the same deterministic analytical tool;
- delta is deterministic;
- no monday.com write occurs.

## Error behavior

At API/product boundaries:

- source/provider exceptions become safe public errors;
- stack traces/credential values are not serialized;
- invalid tool proposals fail closed;
- unsupported analytical requests clarify rather than escaping to arbitrary code/SQL/GraphQL;
- provider failure does not authorize model-side arithmetic.

## Change discipline

When adding a metric or analytical capability:

1. define/implement deterministic calculation in the analytics layer;
2. add tests for null/coverage/time semantics;
3. register semantic meaning/dimensions if the metric is user-facing;
4. add typed tool access only if natural-language use is needed;
5. attach lineage/evidence/caveats;
6. update product documentation without overstating deployment availability.
