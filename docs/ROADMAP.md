# Roadmap

Skylark Command's roadmap is organized by evidence, not hype. Capabilities move from research to product only when the underlying data and reliability contracts are strong enough to support them.

## Shipped

### Trust-native analytical foundation

- Live, read-only monday.com Deals and Work Orders integration.
- Typed normalization with explicit null/quality handling.
- Deterministic pipeline, won-value, period, operations, receivables, ranking, risk, and leadership analytics.
- Exact normalized customer joins.
- Data Health and known/unknown coverage.

### Temporal intelligence

- PostgreSQL temporal snapshot schema/store.
- Successful-sync tracking and source watermarks.
- Configurable live / temporal-preferred / temporal-only serving modes.
- Historical snapshot provider with sparse-history behavior.
- Change Intelligence for pipeline, customers, and receivables.
- Change Detective product surface.

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

## Next

These items extend reliability and product usability without changing the trust model.

### Operationalize temporal capture

- Configure a real scheduled caller for `/api/internal/sync/monday`.
- Establish retention/backup policy for analytical snapshots.
- Add operational visibility for sync freshness, failures, and snapshot counts.
- Add deployment-specific database connection/pooling guidance.

### Evidence navigation

- Make source snapshot IDs and record-level lineage easier to traverse from every material answer.
- Improve comparison views between baseline/current records.
- Standardize FACT / ESTIMATE / INTERPRETATION labels across all surfaces.

### Runtime hardening

- Replace process-local rate limiting with a distributed backend.
- Add organization authentication/RBAC where deployment requirements justify it.
- Add structured observability around tool routing, provider fallback, data freshness, and latency without logging sensitive question/source content.

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
