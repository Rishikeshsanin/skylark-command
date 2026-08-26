# Skylark Command V2 — Copilot Orchestration & Scenario Lab

This branch upgrades Founder Copilot from a phrase router to a constrained analytical orchestrator while preserving the release trust boundary:

`question → approved typed tool → deterministic analytics → authoritative data → optional LLM explanation`

The LLM is a planner and narrator. It never owns business arithmetic.

## Orchestration

`POST /api/chat` accepts a message plus an optional structured `context` object. The optional Gemini planner may propose only a schema-valid tool call. Every proposal is then checked against:

1. the strict Zod tool schema,
2. the allowlisted tool registry,
3. live source entities/dimensions,
4. explicit user/context grounding for free-form entities, dates and monetary filters.

Provider absence, malformed output, tool hallucination, ungrounded parameters, or provider failure falls back to the deterministic planner. Unsupported requests clarify rather than escaping to SQL or GraphQL.

Approved V2 tools:

- `getPipelineSummary`
- `getPipelineBySector`
- `getPipelineByStage`
- `getCustomer360`
- `getReceivables`
- `getWorkOrderHealth`
- `getPeriodComparison`
- `runScenario`

`getChangeIntelligence` is intentionally not registered yet. It requires a durable historical snapshot contract from the V2 data-platform work; registering a fake implementation would weaken the trust model.

## Agent 2 semantic contracts

This branch consumes `src/lib/semantic` from `v2/semantic-evidence` rather than creating a parallel metric vocabulary.

Copilot tool traces use canonical semantic metric IDs such as:

- `open_pipeline_value`
- `known_won_value`
- `receivables`
- `open_deal_count`
- `active_work_order_count`

Each executed tool builds Agent 2 `AnswerLineage`, `EvidenceQuality`, and `TrustResponse` evidence. Cross-board Customer 360 uses the canonical exact normalized-client join contract. Numeric Deal-value threshold filters remain visible in the V2 filter trace; Agent 2 lineage currently models categorical dimensions only, so that limitation is explicitly caveated.

## Structured conversation context

The browser sends only bounded structured analytical context, not the prior raw conversation transcript:

- semantic metric ID
- semantic dimension
- grounded entity
- period
- validated filters
- previous typed tool call
- source snapshot ID
- semantic metric IDs used for the previous result
- previous result reference

Examples:

1. `Which sector has the largest open opportunity?`
2. `Why?` → replays the previous approved tool from structured context.
3. `Show only deals above ₹1Cr.` → retains prior scope and adds a deterministically parsed `deal_value >= 10000000` filter.
4. `Compare that with last quarter.` → creates a typed `getPeriodComparison` call using the retained metric/dimension/entity scope.

The LLM cannot invent a sector, stage, customer, date, amount or record ID. Free-form parameters must both exist in the source snapshot and be grounded in the current message or prior structured context.

## Scenario Lab

Scenario execution is always:

`immutable baseline + validated overrides → cloned hypothetical snapshot → same deterministic analytics → BASELINE / SCENARIO / DELTA`

No source record is overwritten and no monday.com mutation path exists in the scenario engine.

Supported override types:

- `move_deal_close_period`
- `move_deal_close_date`
- `set_deal_included`
- `set_deal_outcome`
- `set_collection_amount`
- `apply_receivable_payment`
- `delay_work_order`
- `resolve_work_order`

### Scenario rules

- Deal/Work Order IDs must exist in the loaded source snapshot.
- IDs must be explicitly grounded in the scenario request.
- Dates/quarters must be explicitly supplied; the LLM cannot invent them.
- A quarter move uses the first day of the selected quarter as a deterministic scenario anchor and discloses that policy as a caveat.
- A receivable payment cannot exceed a known baseline receivable.
- Unknown baseline monetary values are never fabricated.
- `set_collection_amount` modifies collected value only; receivable movement requires the explicit `apply_receivable_payment` override.
- Baseline and scenario use the same registered deterministic analytical tool.
- DELTA is computed deterministically from the two authoritative result structures.

The Copilot UI renders an explicit Scenario Lab block with `BASELINE`, `SCENARIO`, and `DELTA`, plus a reminder that hypothetical values are never written to monday.com.

## Trust trace returned with every Copilot response

Executed responses expose:

- planner used (`gemini` or deterministic fallback)
- analytical tools used
- Agent 2 semantic metric IDs
- validated filters
- source snapshot ID / board IDs / fetch timestamp
- Deal and Work Order evidence IDs/counts
- Agent 2 semantic trust response and evidence-quality classification
- separate baseline/scenario trust for Scenario Lab
- structured next-turn context
- caveats

Clarifications and errors expose the same trace shape with zero executed tools and `sourceSnapshot: null`.

## Evaluation dataset

`src/lib/agent/v2/eval-dataset.ts` is a fixed regression set covering:

- intent/tool selection
- parameter extraction
- clarification accuracy
- multi-turn context
- unsupported requests
- injection resistance
- tool hallucination
- fallback behavior

`src/lib/agent/v2/v2.test.ts` also covers scenario immutability, scenario reruns, deterministic deltas, receivable-payment safety, strict context/tool schemas and Agent 2 trust integration.

## Integration notes

- Stable V1 / shared V2 starting commit is `2a3309a7cd7385163a0d63e38495b2b9bd095595`; there is no literal `v2` branch.
- When Agent 2 semantic work landed, `v2/copilot-scenario` was fast-forwarded to the semantic-contract commits before Copilot changes were committed; future integration target is `v2-integration`.
- The current orchestration imports Agent 2 semantic contracts directly.
- Future V2 data-platform integration should add durable snapshot IDs/history and then register `getChangeIntelligence`; do not implement it with ephemeral/current-only data.
- Scenario execution currently operates on the normalized in-memory snapshot loaded for the request. Persisted named scenarios can be layered above this engine without changing arithmetic ownership.
