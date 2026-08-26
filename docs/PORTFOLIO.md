# Portfolio & Resume Notes

This document keeps the project story concise enough for a resume, portfolio page, or technical interview without overstating scale or claiming unbuilt ML.

## Project title

**Skylark Command — Trust-Native Executive Decision Intelligence Platform**

## One-line description

Built a full-stack Applied AI decision-intelligence platform that turns live monday.com CRM/operations data into deterministic analytics, temporal Change Intelligence, Customer 360, typed natural-language tools, scenario analysis, workspace-aware authorization, observability, and auditable evidence lineage.

## Resume bullets

- **Engineered a trust-native Applied AI architecture** where Next.js/TypeScript deterministic analytics own business metrics while an optional Gemini layer is constrained to typed tool planning and qualitative interpretation, with schema validation, grounding, prompt-injection defenses, and deterministic fallback.
- **Built temporal and cross-board decision intelligence** using PostgreSQL point-in-time snapshots, migration drift protection, Change Intelligence, exact normalized customer joins, Customer 360, and customer-contribution analytics over live read-only monday.com Deals and Work Orders.
- **Implemented production-hardening foundations** including managed-auth workspace isolation, persisted `OWNER`/`ADMIN`/`ANALYST`/`VIEWER` RBAC, request IDs, structured redacted telemetry, protected diagnostics, fixed Copilot evaluations, automated analytics/security/temporal tests, lint/build gates, and responsive executive visualizations.

## 30-second interview explanation

> “Skylark Command is an executive decision-intelligence product over live monday.com sales and operations data. The interesting part is the trust architecture: I did not let the LLM calculate pipeline or receivables. Business arithmetic stays deterministic in TypeScript, metrics are registered semantically, and the Copilot can only invoke typed analytical tools after schema and grounding checks. V2 adds PostgreSQL point-in-time snapshots for ‘what changed?’ questions, exact-key Customer 360, a deterministic Scenario Lab, server-owned workspace/RBAC boundaries, and structured observability. Generated language is interpretation layered on top of evidence, not the source of truth.”

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

### 8. How do workspace permissions work?

No explicit workspace selector means public read-only demo mode. An explicit workspace request validates managed identity, resolves exact active membership from the database, and derives the canonical role from `workspace_members` rather than trusting a client/JWT role claim. Workspace data access fails closed if isolated serving is unavailable, and `VIEWER` is denied Scenario Lab before execution.

### 9. What does observability cover?

The server emits structured JSON events with request IDs and AsyncLocalStorage context for request latency, deterministic tools, provider fallback, sync/database operations, watermark/freshness, and safe error categories. Secret values are redacted, while prompt bodies, chain-of-thought, and raw source records are intentionally excluded. A protected diagnostics route and fixed Copilot evaluation runner provide operator/release signals without making an external vendor mandatory.

### 10. What would you build next?

First validate the hardened migrations against an isolated real staging database, then deliberately operationalize snapshot scheduling. Product work would add frontend account management, workspace-specific credential resolution/onboarding, and distributed rate limiting. Predictive conversion/collections/delivery models would only come after enough point-in-time history exists for leakage-safe labels and time-based evaluation.

## Portfolio positioning

A strong way to describe the project is:

> **Applied AI + analytics systems engineering, not a chatbot wrapper.**

The engineering depth is in the combination of:

- live SaaS data integration;
- deterministic business semantics;
- temporal data architecture and migration hardening;
- typed AI tool orchestration;
- exact cross-domain joins;
- scenario intelligence;
- server-owned workspace/RBAC foundations;
- evidence lineage;
- safe failure/fallback behavior;
- structured observability/evaluation;
- responsive product delivery.

## Claims to avoid

Do not describe Skylark Command as having:

- production-scale user/revenue adoption unless independently true;
- predictive ML models already in production;
- autonomous CRM write-back;
- fuzzy AI identity resolution;
- complete historical coverage in an environment that has only sparse snapshots;
- a finished frontend account-management/tenant-onboarding product;
- workspace-specific secret resolution/sync unless actually configured;
- production migrations or production cron that have not actually been executed;
- enterprise SSO deployment/configuration merely because the backend managed-auth/RBAC foundation exists.

The portfolio story is stronger when the trust boundaries are explicit rather than inflated.
