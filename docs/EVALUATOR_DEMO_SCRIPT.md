# Skylark Command — Evaluator Demo Script

Target: a crisp 2–3 minute walkthrough that proves business value, engineering judgment, live monday integration, data resilience, and AI reliability.

## Opening — 15 seconds

> Skylark Command is a founder-facing business intelligence copilot built on live monday.com Deals and Work Orders data. The core design principle is simple: the AI interprets the question, but deterministic TypeScript analytics calculate the business truth.

Show the executive overview and the live-data/source indicator.

## 1. Commercial intelligence — 30 seconds

Ask:

> How is our pipeline looking?

Point out:

- open pipeline value
- deal count / stage mix
- one meaningful observation
- visible data-quality caveat
- monday.com provenance / retrieval time

Then ask:

> How is the energy sector performing?

This demonstrates semantic filtering rather than a hardcoded dashboard.

## 2. Operational intelligence — 25 seconds

Ask:

> Which work orders are delayed or at risk?

Point out execution status, receivables/billing context if relevant, and that missing fields are surfaced rather than fabricated.

## 3. Cross-board intelligence — 30 seconds

Ask:

> Which clients have open commercial opportunity and operational risk at the same time?

Explain that client IDs from the two monday boards are normalized deterministically and joined only when the identity rule is valid.

This is the strongest proof that the product is more than a single-board chatbot.

## 4. Reliability / clarification — 20 seconds

Ask:

> Who are our best customers?

Show the clarification behavior (for example revenue, pipeline value, or operational performance) instead of allowing the model to silently choose an arbitrary definition.

## 5. Leadership Brief — 25 seconds

Open/generate the Leadership Brief.

> We interpreted the optional leadership-update requirement as a concise decision-ready summary: commercial position, operational health, key risks, and data-quality caveats.

## 6. Data Health — 20 seconds

Show the Data Health view.

Mention:

- source data is intentionally messy
- invalid/missing values remain explicit
- calculations disclose exclusions
- the original monday data remains unchanged/read-only

## Closing — 15 seconds

> The system is deliberately designed so an LLM cannot invent revenue or pipeline totals. monday.com is the live source of truth, normalization handles imperfect source data, deterministic analytics compute the metrics, and AI is used for language understanding and executive explanation.

## Backup demo questions

If a particular question produces an uninteresting result, use:

- `What is our open pipeline value?`
- `Show pipeline by stage.`
- `Which are our largest open deals?`
- `What are our receivables?`
- `Which accounts are AR priorities?`
- `Prepare a leadership brief.`
- `What data-quality issues should leadership know about?`

## Things never to show during the demo

- environment-variable values
- monday API token
- AI provider key
- raw stack traces
- internal developer-only logs containing sensitive records
- local spreadsheet as the production data source
