# Founder Copilot 2.0 & Scenario Lab

Founder Copilot 2.0 upgrades natural-language BI from phrase routing into a constrained analytical orchestrator while preserving a deterministic source of business truth.

Core flow:

`question → typed plan → validation/grounding → approved analytical tool → deterministic result → evidence → optional interpretation`

## Typed orchestration

`POST /api/chat` accepts a message plus optional structured analytical context. Provider-generated plans are proposals, not authority.

Before a tool executes, the proposal must satisfy:

1. strict Zod schema validation;
2. approved tool allowlist;
3. source-entity validation;
4. grounding of free-form entities, dates, amounts, and record IDs;
5. deterministic analytical execution.

Provider absence, malformed output, hallucinated tools, or invalid parameters fall back to deterministic behavior for supported questions or return an explicit clarification/unsupported result.

## Approved analytical surface

The V2 contracts include typed tools for:

- `getPipelineSummary`
- `getPipelineBySector`
- `getPipelineByStage`
- `getCustomerContribution`
- `getChangeIntelligence`
- `getCustomer360`
- `getReceivables`
- `getWorkOrderHealth`
- `getPeriodComparison`
- `runScenario`

The model does not receive arbitrary SQL, arbitrary GraphQL, or source-system mutation tools.

## Semantic contracts and trust trace

Copilot tool traces use canonical semantic metric IDs from `src/lib/semantic` and can expose:

- planner path;
- tools used;
- semantic metric IDs;
- validated filters;
- source snapshot metadata;
- Deal/Work Order evidence IDs and counts;
- historical source snapshot IDs where applicable;
- semantic trust/evidence quality;
- scenario baseline/scenario trust;
- structured next-turn context;
- caveats.

Cross-board customer analysis uses exact normalized-client joins.

## Structured conversation context

The browser sends bounded analytical context rather than relying on a raw prior transcript as execution state.

Context may retain:

- semantic metric ID;
- dimension;
- grounded entity;
- period;
- validated filters;
- previous typed tool call;
- source snapshot ID;
- semantic metric IDs used in the previous result;
- previous result reference.

Examples:

1. `Which sector has the largest open pipeline?`
2. `Why?` → reuses prior approved analytical scope.
3. `Show only deals above ₹1Cr.` → retains compatible scope and adds a deterministic value filter.
4. `Which customers are behind those?` → dispatches customer-contribution analytics over the retained filters.
5. `Compare that with last quarter.` → builds a typed period comparison from retained context.

## Change Intelligence

`getChangeIntelligence` uses actual available historical snapshots through the V2 historical-provider boundary.

Supported focus areas include:

- all material changes;
- pipeline;
- customers;
- receivables.

The analytical result retains source snapshot IDs and caveats. Sparse or unavailable durable history is not replaced with synthetic data.

Direct change arithmetic is deterministic. Explicit distribution-based materiality methods are classified as estimates rather than raw stored facts. Optional LLM text remains interpretation.

## Customer contribution

`getCustomerContribution` provides a deterministic answer to follow-ups such as `Which customers are behind those?`.

It can preserve/validate analytical scope including:

- open-pipeline or known-won-value metric;
- Deal status;
- sector;
- stage;
- customer;
- minimum/maximum Deal value;
- period;
- explicit Deal IDs.

Conflicting metric/status combinations and invalid ranges fail validation rather than being silently corrected by the model.

## Scenario Lab

Scenario execution follows:

`immutable baseline + validated overrides → cloned hypothetical snapshot → same deterministic analytics → BASELINE / SCENARIO / DELTA`

Supported override types include:

- `move_deal_close_period`
- `move_deal_close_date`
- `set_deal_included`
- `set_deal_outcome`
- `set_collection_amount`
- `apply_receivable_payment`
- `delay_work_order`
- `resolve_work_order`

### Scenario rules

- Referenced Deal/Work Order IDs must exist.
- IDs and free-form parameters must be grounded.
- Dates/quarters are explicit; they are not invented by the provider.
- A receivable payment cannot exceed a known baseline receivable.
- Unknown baseline monetary values are not fabricated.
- Baseline and scenario use the same registered deterministic analytical tool.
- Delta is computed deterministically.
- No override writes to monday.com.

Scenario Lab is what-if analysis, not predictive ML.

## Provider role

Gemini is optional and can improve natural-language planning/interpretation. It does not own business arithmetic.

Provider failure therefore has a bounded failure mode:

- preserve deterministic analytical capability where supported;
- use deterministic fallback planning/wording;
- never replace a failed tool with model-side arithmetic.

## Evaluation coverage

V2 tests cover categories including:

- intent/tool selection;
- parameter extraction;
- clarification behavior;
- multi-turn context;
- unsupported requests;
- injection resistance;
- tool hallucination;
- provider fallback;
- Change Intelligence routing;
- customer-contribution scope;
- scenario immutability and delta behavior;
- strict schema/grounding behavior.

See [TRUST_MODEL.md](TRUST_MODEL.md) for the broader system trust model and [ARCHITECTURE.md](ARCHITECTURE.md) for data/temporal architecture.
