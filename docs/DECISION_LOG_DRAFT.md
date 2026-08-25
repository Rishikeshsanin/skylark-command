# Skylark Command — Decision Log (Draft)

> Integration note: finalize after all three feature branches land. Keep the submitted version to approximately two pages.

## 1. Problem framing

The goal is not to build a generic chatbot. Skylark Command is designed as a founder-facing BI product over live monday.com Deals and Work Orders data. The product must answer business questions, tolerate incomplete/inconsistent source data, combine both boards when appropriate, and explain uncertainty rather than fabricate certainty.

## 2. Architecture decisions

### monday.com is the live source of truth

The supplied spreadsheets are used only to seed separate monday.com boards. The deployed application queries monday.com dynamically. We intentionally avoid shipping the source spreadsheets as the production analytics database.

**Trade-off:** This adds network latency and dependence on monday availability, but demonstrates the required real integration and keeps the application aligned with the operational source.

### Read-only application access

The application only needs to analyze source records, so it exposes no business-data mutation path.

**Reason:** Least privilege reduces the risk of accidental changes during a hiring prototype and makes the trust boundary easier to explain.

### Deterministic analytics for business arithmetic

LLMs are used for question interpretation, clarification, and executive explanation. Pipeline totals, revenue, receivables, stage/sector breakdowns, work-order health, and cross-board metrics are computed in deterministic TypeScript.

**Reason:** Business metrics should be reproducible and testable. The model should not be asked to "do the math" from loosely structured records.

### Normalization before analytics

Raw monday values are mapped into typed `Deal` and `WorkOrder` models. Invalid or unavailable values remain nullable; they are not silently coerced into plausible values.

**Reason:** The supplied data is intentionally imperfect. Treating data quality as an explicit layer makes downstream metrics more trustworthy and lets answers disclose exclusions.

### Deterministic client matching across boards

The two datasets use different masked customer-code formats. Matching is performed only through an explicit normalization rule instead of fuzzy LLM matching.

**Reason:** Cross-board analysis is valuable, but false joins would be worse than missing joins.

## 3. Product decisions

### Executive command center rather than chat-only UI

The product includes an executive overview plus Founder Copilot, Pipeline, Operations, Leadership Brief, and Data Health experiences.

**Reason:** A founder should get useful context before asking a question; evaluators should also be able to discover key capabilities quickly.

### Clarification is a first-class outcome

Ambiguous questions such as "Who are our best customers?" can request clarification rather than silently choosing a metric.

**Reason:** This reduces false confidence and better reflects how a real business analyst would respond.

### Visible provenance and caveats

Where practical, responses include source/freshness context and explicit data-quality caveats.

**Reason:** Executives need to know whether an answer is based on complete/current data, especially when decisions may depend on it.

## 4. Interpretation of "leadership updates"

We interpret the optional leadership-update requirement as a concise, decision-ready brief rather than a raw data export. The brief should prioritize:

1. commercial position / pipeline,
2. operational Work Order health,
3. material receivables or execution risks,
4. clients with combined commercial and operational exposure,
5. data-quality caveats that affect confidence.

This is intentionally summary-first: leadership should see what changed or needs attention before drilling into details.

## 5. Security and reliability choices

- Secrets remain server-side and are supplied through deployment environment variables.
- User input is validated and bounded.
- Public chat/API access is rate-limited.
- monday/AI failures return controlled errors rather than raw provider responses.
- Source text is treated as untrusted data, not as system instructions, reducing prompt-injection risk from board content.
- An AI provider failure must never cause fabricated business metrics; deterministic analytics remain authoritative.

## 6. Assumptions

- Masked business values and identifiers should remain masked; the product does not attempt to reverse them.
- Null or malformed values are genuinely unavailable unless a deterministic normalization rule is justified.
- Cross-board client matching uses the documented normalized masked client key only.
- Dates are interpreted from the source values as provided; current-quarter questions must acknowledge when the dataset contains no relevant current-period records.
- For a time-boxed hiring prototype, application-level authentication/RBAC is lower priority than live data correctness, secret protection, read-only access, validation, and rate limiting.

## 7. What we would improve with more time

- Add enterprise authentication and role-based access control.
- Add durable distributed rate limiting rather than prototype-level limits.
- Add richer historical trend analytics and saved executive views.
- Add contract/integration tests against mocked monday responses and a staging board.
- Add stronger observability/SLOs for monday and AI-provider failures.
- Add user-configurable business definitions for terms such as "at risk" and "best customer."
- Add feedback/evaluation traces for copilot answers without storing sensitive content unnecessarily.
- Add exports/scheduled leadership briefs if required by the real operating workflow.

## 8. AI/tool usage

AI coding assistants were used to accelerate implementation, review architecture, and parallelize clearly separated workstreams. Shared domain contracts and deterministic business rules were kept explicit so generated code could be reviewed against a single source of truth. The submitted repository and Decision Log are intended to make those decisions explainable rather than hide the use of AI assistance.
