# Skylark Command — Decision Log

This log records the decisions that materially affect trust, evaluator behavior, and production readiness. Application RC3 is `039cadfda8678ff82e105bf5fea2da72937c18c6`.

## 1. Deterministic BI before LLM

**Decision:** TypeScript owns normalization, joins, filters, period selection, arithmetic, rankings, risk flags, and aggregations. The LLM receives only an already-computed analytical result to explain.

**Reason:** Founder-facing metrics must be repeatable, inspectable, and unit-testable. Model wording or provider availability cannot determine business truth.

## 2. Live monday.com is the runtime source

**Decision:** The application fetches both monday.com boards at runtime with server-side pagination and `cache: "no-store"`. Excel/CSV assignment data is not embedded in the product.

**Reason:** A live BI product must reflect the configured source rather than a stale snapshot. The documented golden baseline is acceptance evidence, not a hardcoded dataset.

## 3. monday.com remains read-only

**Decision:** The shared client exposes query/fetch behavior and rejects GraphQL documents containing mutations.

**Reason:** The assignment requires read-only access, and an executive analysis surface should not be able to change operational source records.

## 4. Gemini explains; it does not calculate

**Decision:** Optional `gemini-2.5-flash-lite` output is limited to qualitative executive narration. Deterministic `AgentResponse.data` remains authoritative. `GEMINI_API_KEY` is preferred; `AI_API_KEY` is a backward-compatible fallback.

**Reason:** AI can improve interpretation without becoming a non-deterministic calculator or a dependency for core BI.

## 5. Numeric prose has a trust guard

**Decision:** Generated explanation is schema-validated and rejected if it contains numeric characters. Numeric values are rendered from structured deterministic data.

**Reason:** This prevents model prose from inventing, rounding, or silently changing a pipeline, revenue, receivables, count, date, or percentage.

## 6. Provider failure has a deterministic fallback

**Decision:** Missing provider configuration, timeout, rate limit, network failure, invalid schema, or numeric-guard failure returns a deterministic explanation while preserving the analytical data.

**Reason:** A provider outage must degrade narration, not the answer or application availability.

## 7. Unknown data stays unknown

**Decision:** Missing or malformed numeric/date values normalize to `null`. Monetary totals sum known values only, and available known/unknown coverage counts remain visible. Known won value is not described as complete historical revenue.

**Reason:** Imputing zero or silently dropping coverage language would create false executive confidence.

## 8. “Best customers” requires clarification

**Decision:** The copilot asks the evaluator to choose highest won value, largest active pipeline, best project execution, or combined commercial + operational importance. Controlled selections map to deterministic ranking functions.

**Reason:** “Best” has no single defensible business meaning. The product should ask, not invent an objective.

## 9. Cross-board matching is exact after normalization

**Decision:** Known company-code formats are normalized deterministically (for example, `WOCOMPANY_002` and `COMPANY_002` become `COMPANY002`). Cross-board presence is the intersection of unique exact keys. Unknown formats are trimmed and upper-cased but never fuzzily guessed.

**Reason:** Exact normalized matching fixes known formatting variance while avoiding false joins and row-count inflation.

## 10. Current-quarter absence is not zero performance

**Decision:** A requested current/explicit quarter with no usable records returns a no-data state and latest-available-period context when one exists.

**Reason:** “No records” and “zero business” are materially different conclusions.

## 11. Analysis time is explicit

**Decision:** Time-dependent calculations accept an `asOfDate` rather than reading the system clock inside analytics.

**Reason:** Delay, staleness, and current-quarter behavior remain deterministic and testable.

## 12. Evaluator access versus production identity controls

**Decision:** The hiring preview is evaluator-accessible without introducing last-minute application SSO/RBAC. Secrets remain server-only, monday access remains read-only, and API controls remain active. A production rollout should add organization SSO/RBAC, deployment access policy, and distributed rate limiting.

**Reason:** Adding identity infrastructure immediately before evaluation could block the reviewer and expands the release surface. The accessible preview is a deliberate evaluation trade-off, not a claim of full enterprise access-control readiness.
