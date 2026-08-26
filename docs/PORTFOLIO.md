# Portfolio & Resume Notes

This document keeps the project story concise enough for a resume, portfolio page, or technical interview without overstating scale or claiming unbuilt ML.

## Project title

**Skylark Command — Trust-Native Executive Decision Intelligence Platform**

## One-line description

Built a full-stack Applied AI decision-intelligence platform that turns live monday.com CRM/operations data into deterministic analytics, temporal Change Intelligence, Customer 360, typed natural-language tools, scenario analysis, and auditable evidence lineage.

## Resume bullets

- **Engineered a trust-native Applied AI architecture** where Next.js/TypeScript deterministic analytics own business metrics while an optional Gemini layer is constrained to typed tool planning and qualitative interpretation, with schema validation, grounding, prompt-injection defenses, and deterministic fallback.
- **Built temporal and cross-board decision intelligence** using PostgreSQL point-in-time snapshots, Change Intelligence, exact normalized customer joins, Customer 360, and customer-contribution analytics over live read-only monday.com Deals and Work Orders.
- **Implemented evidence-first production reliability** with semantic metric contracts, answer lineage, known/unknown coverage, data-quality diagnostics, isolated what-if Scenario Lab execution, automated analytics/security/temporal tests, lint/build gates, and responsive executive visualizations.

## 30-second interview explanation

> “Skylark Command is an executive decision-intelligence product over live monday.com sales and operations data. The interesting part is the trust architecture: I did not let the LLM calculate pipeline or receivables. Business arithmetic stays deterministic in TypeScript, metrics are registered semantically, and the Copilot can only invoke typed analytical tools after schema and grounding checks. V2 adds PostgreSQL point-in-time snapshots for ‘what changed?’ questions, exact-key Customer 360, and a deterministic Scenario Lab. Generated language is interpretation layered on top of evidence, not the source of truth.”

## Technical interview talking points

### 1. Why not let the LLM calculate metrics?

Executive metrics need stable definitions, reproducibility, testability, and reliable failure behavior. A model is useful for intent interpretation but is a poor authority for arithmetic or joins. Skylark therefore uses the LLM as a bounded planner/narrator around deterministic analytical functions.

### 2. How does the Copilot avoid arbitrary tool use?

Tool calls are defined as strict Zod discriminated unions. A provider proposal must match a known tool, pass the allowlist, and ground entities/amounts/dates/record IDs in the current question or structured context. Invalid proposals fall back or clarify instead of gaining access to SQL/GraphQL.

### 3. How does multi-turn context work?

The client preserves bounded analytical context—metric, dimension, entity, period, validated filters, previous typed tool, and snapshot reference—rather than replaying the whole conversation as an instruction blob. This supports follow-ups while keeping the execution state inspectable.

### 4. How did you handle messy data?

Normalization converts invalid/missing values to `null`, preserves quality flags, distinguishes GST-inclusive/exclusive fields, and exposes known/unknown coverage. It does not impute missing money as zero just to produce clean-looking totals.

### 5. How does Customer 360 join two boards safely?

Known customer-code formats are normalized deterministically and then joined by exact equality. Fuzzy or LLM-assisted matching is deliberately excluded from authoritative analytics because false joins are difficult to detect and can corrupt executive conclusions.

### 6. How does Change Intelligence work?

A temporal store persists successful normalized point-in-time snapshots in PostgreSQL. Historical queries retrieve bounded successful snapshots. Change analytics compare real captured states and disclose when the history is too sparse. The system does not synthesize a prior week from current data.

### 7. Is Scenario Lab predictive AI?

No. It is deterministic what-if analysis: clone the baseline, apply validated overrides, rerun the same analytical function, and calculate delta. It answers “what would this metric become under stated assumptions?” rather than “what is likely to happen?”

### 8. What would you build next?

Operationalize scheduled temporal capture, add distributed runtime controls/observability, and improve evidence navigation. Predictive conversion/collections/delivery models would only come after enough point-in-time history exists for leakage-safe labels and time-based evaluation.

## Portfolio positioning

A strong way to describe the project is:

> **Applied AI + analytics systems engineering, not a chatbot wrapper.**

The engineering depth is in the combination of:

- live SaaS data integration;
- deterministic business semantics;
- temporal data architecture;
- typed AI tool orchestration;
- cross-domain joins;
- scenario intelligence;
- evidence lineage;
- safe failure/fallback behavior;
- responsive product delivery.

## Claims to avoid

Do not describe Skylark Command as having:

- production-scale user/revenue adoption unless independently true;
- predictive ML models already in production;
- autonomous CRM write-back;
- fuzzy AI identity resolution;
- complete historical coverage in an environment that has only sparse snapshots;
- enterprise SSO/RBAC unless the deployed environment adds it.

The portfolio story is stronger when the trust boundaries are explicit rather than inflated.
