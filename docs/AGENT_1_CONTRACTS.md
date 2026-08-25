# Agent 1 Data & BI Contracts

## Purpose

This document is the handoff contract for Agents 2 and 3. The data layer returns normalized domain models from live monday.com boards; deterministic analytics perform all arithmetic before any LLM explanation or UI rendering.

## Imports

- Domain contracts: `src/types`
- Live source loader: `src/lib/business-data`
- Deterministic analytics: `src/lib/analytics`
- monday client/errors: `src/lib/monday`
- Normalization helpers: `src/lib/normalization`

## Core rules

1. `Deal` and `WorkOrder` use `null` for missing or invalid source values. Do not replace null with zero unless a metric explicitly sums known values and exposes an unknown-value count/caveat.
2. Currency field names preserve whether the source is GST-inclusive or GST-exclusive. Do not mix those bases.
3. The canonical cross-board join key is `normalizedClientKey`. Known mappings such as `WOCOMPANY_002 -> COMPANY002` are normalized deterministically.
4. `loadBusinessData()` fetches monday.com dynamically on the server. Do not import source Excel/CSV into runtime code.
5. The monday client rejects GraphQL mutations and reads credentials only from server environment variables.
6. Analytics functions are pure/deterministic. Pass `asOfDate` explicitly to functions whose result depends on time.
7. `buildLeadershipBriefData()` returns facts/metrics only. Agent 2 may narrate these facts but must not recompute them with an LLM.
8. New presentation-aware analytics use canonical `currencyCode: "INR"` and exact provenance counts.

## Metric semantics

- Open deal: Deal Status exactly `Open` (case/whitespace normalized).
- Active deal: Deal Status is one of `Open`, `On Hold`, `Working on it`, `Stuck`.
- Won value: sum of known deal values where Deal Status is `Won`.
- Open pipeline value: sum of known values for open deals. Missing values remain unknown and are counted separately.
- Close quarter: actual close date when present, otherwise tentative close date. If neither source date is usable, the record is excluded from period analytics and a caveat is returned.
- Period no-data behavior: `hasData: false`, `result: null`; do not narrate the period as zero performance. `latestAvailablePeriod` and `latestAvailableResult` are provided when a usable fallback exists.
- Sector-period performance is Deal-based because Work Orders do not share a canonical equivalent close-quarter dimension.
- Active Work Order: normalized execution status bucket is ongoing, not-started, paused, or other active.
- Delayed Work Order: active item whose relevant probable start/end date is before the caller-supplied analysis date.
- Receivables: source `Amount Receivable` field; no inferred AR formula is substituted.
- Unbilled amount: source `Amount To Be Billed Incl GST` field for GST-inclusive reporting.

## Founder intelligence exports

### Period analytics

- `getCurrentQuarter(asOfDate)`
- `getLatestAvailableQuarter(deals, openOnly?)`
- `getPipelineForQuarter(deals, requestedPeriod)`
- `getPipelineForCurrentQuarter(deals, asOfDate)`
- `getSectorPerformanceForQuarter(deals, requestedPeriod)`
- `getSectorPerformanceForCurrentQuarter(deals, asOfDate)`

Quarter strings use canonical `Q# YYYY`, for example `Q3 2026`.

### Customer rankings

- `rankCustomersByWonValue(deals)`
- `rankCustomersByOpenPipeline(deals)`
- `rankCustomersByWorkOrderExecutionHealth(workOrders, asOfDate)`
- `rankCustomersByCombinedImportance(deals, workOrders, asOfDate)`

Rank ties use competition ranking (`1, 1, 3`). Unmatched customer records are excluded and counted; fuzzy matching is never performed.

The Work Order execution-health score is deterministic: `4× delayed + 4× paused + 3× AR-priority + 1× active`.

Combined importance is an exposure indicator, not an accounting metric: known won value + known open pipeline + Work Order value incl GST + receivables.

### Founder attention feed

- `getFounderAttentionFeed(deals, workOrders, asOfDate)`

The feed is rule-based decision support, not ML. It prioritizes major commercial opportunities with delivery risk, large/AR-priority receivables, stale high-value open deals, paused/delayed Work Orders, and elevated known-value pipeline concentration. Dataset-relative "major/large/high-value" thresholds use the 75th percentile of positive known values.

## Error handling

Catch `MondayApiError` at API boundaries. Return user-safe error codes/messages; never serialize the underlying cause or environment values.
