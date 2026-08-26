# Decision Log

This log records product and engineering decisions that materially affect correctness, trust, and maintainability.

## 1. Deterministic analytics own business truth

**Decision:** TypeScript owns normalization, joins, filters, arithmetic, rankings, period semantics, change deltas, and scenario deltas.

**Reason:** Executive metrics must be reproducible, inspectable, and unit-testable. Provider wording or availability cannot determine a business number.

## 2. Live monday.com is a source system, not a write target

**Decision:** The application reads configured monday.com boards server-side and rejects mutation documents in the analytical source client.

**Reason:** Decision support should not silently mutate operational truth. Scenarios remain isolated from source data.

## 3. Unknown data stays unknown

**Decision:** Missing or malformed numeric/date values normalize to `null`. Known-only monetary sums disclose incomplete coverage where relevant.

**Reason:** Converting missing values to zero would create false precision and can materially distort executive conclusions.

## 4. Cross-board customer matching is exact after normalization

**Decision:** Known client-code variants are normalized deterministically and joined by exact key equality. Unknown identities are not fuzzily guessed.

**Reason:** A visible unmatched customer is safer than an invisible false join.

## 5. Time-dependent analytics use explicit time semantics

**Decision:** Analytics that depend on “current”, delay, staleness, or quarter receive explicit analysis time/date inputs where appropriate.

**Reason:** Results remain deterministic and testable rather than depending on hidden wall-clock behavior.

## 6. Current-period absence is not zero performance

**Decision:** A requested period with no usable records is represented as no data, optionally with latest-available context.

**Reason:** “No observations” and “zero business” are different facts.

## 7. Historical intelligence requires captured history

**Decision:** V2 stores successful point-in-time normalized snapshots in PostgreSQL and queries them through a temporal-store abstraction.

**Reason:** A current-state API cannot truthfully reconstruct a previous week after the fact. Historical questions require actual historical evidence.

## 8. No synthetic history

**Decision:** When historical snapshot coverage is sparse or absent, Change Intelligence reports the limitation rather than generating a prior state.

**Reason:** Invented history would turn a product gap into a false analytical claim.

## 9. Semantic definitions annotate; they do not recalculate

**Decision:** `src/lib/semantic` registers metric IDs, dimensions, joins, lineage, and evidence quality while `src/lib/analytics` remains the arithmetic owner.

**Reason:** Central semantics reduce drift without creating two competing implementations of the same metric.

## 10. Evidence quality is descriptive, not model confidence

**Decision:** Evidence quality uses explicit deterministic factors such as completeness, freshness, join coverage, temporal coverage, and source issues.

**Reason:** A model confidence score would not explain whether the underlying business evidence is actually complete or fresh.

## 11. The LLM is a bounded planner and interpreter

**Decision:** Optional Gemini output can propose schema-valid typed tools and generate qualitative explanation after analytics exist. Tool proposals remain subject to allowlist and grounding checks.

**Reason:** Language flexibility is valuable; unrestricted arithmetic or tool authority is not.

## 12. Provider failure cannot own analytics availability

**Decision:** Supported deterministic planning/fallback behavior remains available when provider configuration/output fails.

**Reason:** An external model outage should degrade interpretation rather than corrupt or erase authoritative analytics.

## 13. Multi-turn state is structured

**Decision:** Copilot context retains bounded analytical state such as metric, dimension, entity, period, filters, prior typed tool, and snapshot reference instead of treating the full prior transcript as executable state.

**Reason:** Structured state is easier to validate, ground, test, and explain.

## 14. Ambiguous business goals should clarify

**Decision:** Requests whose objective is not well-defined—such as “best customer” without a definition—should clarify or map only to explicitly supported semantics.

**Reason:** The product should not silently choose a business objective that the user did not specify.

## 15. Scenario Lab is deterministic what-if analysis

**Decision:** Scenarios apply validated overrides to cloned snapshots, rerun the same analytical tool, and calculate delta in code. They are not described as predictions.

**Reason:** Assumption analysis is valuable without pretending to know future probability.

## 16. Predictive ML waits for temporal evidence

**Decision:** Pipeline-conversion, collections-risk, and delivery-risk models remain research directions until sufficient point-in-time history exists for defensible labels and evaluation.

**Reason:** A predictive claim without adequate historical training/evaluation evidence would violate the product's trust model.

## 17. Live and temporal serving are separate deployment modes

**Decision:** Current-state deployments can run in `live` mode, while deployments with PostgreSQL history can opt into `temporal_preferred` or `temporal_only`.

**Reason:** Historical infrastructure should add capability without making the current-state product unusable in environments that have not operationalized a temporal store.

## 18. Temporal sync is authenticated and scheduler-agnostic

**Decision:** `/api/internal/sync/monday` requires a bearer `CRON_SECRET`; the repository does not hard-code a specific scheduling provider.

**Reason:** Capture cadence is an operations concern, while authentication and snapshot semantics belong in the application contract.

## 19. Process-local rate limiting is an explicit limitation

**Decision:** Current request throttling remains process-local; distributed enforcement is tracked as runtime hardening rather than being implied as complete.

**Reason:** Serverless scale can span multiple instances. The limitation should be visible rather than overstated.

## 20. Portfolio claims follow deployed evidence

**Decision:** Documentation distinguishes repository capabilities from what is currently available on a public deployment and only labels real captures as screenshots of the states they actually show.

**Reason:** A trustworthy product story must apply the same evidence discipline to its own portfolio presentation.
