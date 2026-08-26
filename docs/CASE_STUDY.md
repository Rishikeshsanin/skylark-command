# Technical Case Study

## Skylark Command — trust-native executive decision intelligence

Skylark Command began as an executive BI problem over messy CRM and operational data and evolved into a broader Applied AI system: deterministic analytics, historical change intelligence, Customer 360, typed conversational tools, scenario analysis, and evidence-first decision support.

The important engineering problem was not “how do we put a chatbot on a dashboard?” It was **how to make natural-language business answers useful without allowing a probabilistic model to silently redefine business truth.**

## Problem

Commercial and operational data lives across monday.com boards with different schemas, incomplete fields, inconsistent identifiers, missing monetary values, and time-dependent status. Executives still want questions such as:

- What changed since last week?
- Which sector has the largest open pipeline?
- Which customers are behind that exposure?
- What is happening with one customer across Deals and Work Orders?
- What would the metrics look like if a Deal moved quarter or a receivable were paid?
- Which parts of this answer should I trust less?

A naïve LLM-first implementation could produce fluent responses while introducing silent arithmetic, fuzzy joins, invented history, or hidden missing-data assumptions.

## Constraints

The design therefore adopted explicit constraints:

- monday.com remains read-only.
- Business arithmetic is deterministic TypeScript.
- Missing source values are not converted into convenient zeros.
- Cross-board customer joins are exact after deterministic normalization.
- Historical comparisons require actual snapshots.
- Scenarios must not mutate source data.
- LLM output is optional and bounded.
- Evidence and limitations should travel with the answer.

## Architecture

The core flow is:

`monday.com → normalization → live/temporal snapshots → deterministic analytics → semantic registry → typed analytical tools → product surfaces → optional LLM interpretation`

PostgreSQL adds point-in-time analytical snapshots for historical questions. The Copilot never receives arbitrary SQL or source-system write access; it plans over a Zod-validated allowlist of business tools.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design.

## Trust challenge

The hardest product question was not model selection. It was deciding **where uncertainty is allowed**.

Skylark uses three classes:

- **FACT** — deterministic value from source records/snapshots.
- **ESTIMATE** — deterministic statistical method with an explicit methodology.
- **INTERPRETATION** — optional generated wording over an existing result.

This separation prevents a persuasive explanation from becoming an accidental source of numeric authority.

## Messy data handling

Operational systems are not clean analytical warehouses. The normalization layer therefore preserves uncertainty explicitly:

- malformed numerics/dates become `null`;
- quality flags remain attached to records;
- known-only sums disclose incomplete coverage;
- time analytics require usable dates;
- exact client normalization handles known code variants but does not guess unknown identities.

This choice makes some answers less tidy, but more defensible.

## AI design

Founder Copilot 2.0 uses a language model as a **bounded planner and narrator**, not a calculator.

A provider proposal must pass:

1. strict schema validation;
2. tool allowlisting;
3. source-entity validation;
4. parameter/context grounding;
5. deterministic execution.

If provider configuration is absent or a proposal is invalid, deterministic fallback behavior remains available for supported questions.

Multi-turn context is represented as structured analytical state rather than simply replaying a raw transcript. That makes follow-ups such as `Why?`, `Show only deals above ₹1Cr`, or `Compare that with last quarter` easier to reason about and safer to validate.

## Historical intelligence

“What changed?” requires time-aware evidence. Current-state API reads cannot truthfully reconstruct a previous week after the fact.

The V2 data platform therefore stores successful normalized point-in-time snapshots in PostgreSQL. Change Intelligence compares available snapshots and can analyze pipeline, customer, or receivables movement. Sparse history is a first-class result: the application reports insufficient comparison evidence rather than generating a synthetic baseline.

This also establishes the data foundation future predictive work would need.

## Customer 360 and contribution

Deals and Work Orders use different operational schemas. Skylark creates Customer 360 by joining on canonical normalized client keys using exact equality.

The system can then connect:

- open and won commercial exposure;
- Work Order execution state;
- billing and collections context;
- receivables;
- customer contribution to a filtered result.

The decision to reject fuzzy matching is deliberate: an unmatched client is visible and fixable, while a false match can contaminate executive conclusions silently.

## Scenario intelligence

Scenario Lab answers deterministic “what-if” questions without claiming prediction.

An override is validated, applied to a cloned snapshot, and the same analytical tool is run for baseline and scenario. The delta is calculated in code.

This creates a clean distinction:

- **scenario analysis:** what the metric becomes under stated assumptions;
- **predictive ML:** what is likely to happen based on learned historical patterns.

Only the first is shipped today.

## Testing and reliability

The repository contains dedicated coverage for:

- normalization and unknown-value handling;
- deterministic analytics;
- period semantics;
- customer joins and rankings;
- Customer 360 and customer contribution;
- temporal persistence/history queries;
- Change Intelligence;
- semantic definitions, lineage, and evidence quality;
- Copilot tool selection and multi-turn behavior;
- prompt injection and untrusted source data;
- provider fallback and safe output handling;
- server validation/errors/rate limits/timeouts;
- visualization/presentation regressions.

The release gate is intentionally command-based rather than tied to a permanently quoted test count:

```bash
npm ci
npm test
npm run lint
npm run build
```

## Security

Security is enforced through boundaries rather than model instructions alone:

- source/provider/database secrets are server-only;
- monday mutation attempts are rejected;
- chat requests are bounded and schema-validated;
- untrusted source text is separated from system instructions;
- tool execution is allowlisted;
- generated plans are grounded;
- public errors are sanitized;
- scenario tools do not expose source write-back;
- temporal sync requires a bearer secret.

A distributed rate limiter and organization identity controls remain production-hardening work.

## What was learned

### 1. “AI-powered” is not the same as “AI-owned”
The most reliable design was to place the LLM around deterministic business capabilities, not beneath them.

### 2. Data quality belongs in the product
Unknowns, unmatched keys, and sparse history affect decisions. Hiding them in logs would make the UI look cleaner while making the system less trustworthy.

### 3. History is infrastructure
Change Intelligence—and eventually defensible predictive ML—depends on reliable point-in-time data capture. It cannot be added honestly as a prompt trick.

### 4. Semantics reduce accidental drift
A metric registry and typed tools make it harder for UI, analytics, and Copilot behavior to silently disagree about what “pipeline” or “won value” means.

### 5. A scenario engine is valuable without prediction
Executives often need assumption analysis before they need a learned model. Deterministic scenarios provide immediate decision support while keeping prediction claims honest.

## Future ML plan

Potential research directions include:

- pipeline conversion probability;
- collections/default risk;
- Work Order delivery-risk prediction.

These are **not shipped models**. They should only be attempted after the temporal data platform accumulates enough point-in-time examples to support:

- leakage-safe training labels;
- train/validation/test splits by time;
- baseline comparisons;
- calibration and error analysis;
- drift monitoring;
- feature provenance.

Until then, rules, deterministic analytics, explicit statistics, and scenarios are the more defensible product choices.

## Outcome

Skylark Command demonstrates a portfolio direction beyond a dashboard or chatbot: **a decision-intelligence system where natural language, temporal analytics, deterministic business logic, and evidence are designed as one trust model.**
