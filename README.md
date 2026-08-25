# Skylark Command

Executive business intelligence for live monday.com sales and operations data, with deterministic analytics and a founder-facing copilot.

> **Release status:** active multi-agent integration. Core BI/data access and the secured `/api/chat` backend are present in the current backend baseline; the product UI exists on `agent-2-product-ui` and must be merged and validated on the integration branch before any production deployment. This repository must not be presented as production-deployed until that release gate is complete.

## What is Skylark Command?

Skylark Command is an internal executive control room for answering business questions across Skylark's Deals and Work Orders boards. It turns messy live operational data into explainable pipeline, revenue, execution, receivables, cross-board, leadership, and data-quality views.

The design principle is simple: **business numbers are computed deterministically first; AI may interpret or explain those results, but it does not invent the calculations.**

## Problem

Founder-level questions often require joining commercial and delivery context across two imperfect monday.com boards. Manual inspection is slow, definitions can drift, and missing or malformed fields can make polished dashboards misleading. Skylark Command centralizes those questions behind explicit analytics contracts, live read-only data access, data-quality caveats, and a controlled copilot interface.

## Product screenshots

Final submission should replace these placeholders with screenshots from the integrated release candidate:

- [ ] Overview dashboard — executive KPIs and business pulse
- [ ] Pipeline — stage/sector/pipeline analysis
- [ ] Operations — work-order execution and billing health
- [ ] Leadership — leadership brief
- [ ] Data Health — missing/malformed/unmapped records
- [ ] Founder Copilot — clarification and executive response states

## Architecture

```text
monday.com Deals + Work Orders boards
                │
                ▼
      server-only read-only client
                │
                ▼
      normalization + quality flags
                │
                ▼
      deterministic BI functions
                │
        ┌───────┴────────┐
        ▼                ▼
 executive dashboards   /api/chat
                           │
                           ▼
                 planner / orchestration
                           │
                           ▼
                 AgentResponse to UI
```

## Live monday.com integration

Production business data is fetched from monday.com at runtime. The data client:

- requires server-side credentials and board IDs;
- rejects GraphQL mutations and permits query-only access;
- uses `cache: "no-store"` for live requests;
- paginates board items instead of embedding assignment spreadsheets;
- normalizes source rows before analytics;
- returns source board metadata and fetch timestamps through the business-data layer.

No real monday.com token belongs in the repository.

## Deterministic BI

The analytics layer owns business calculations such as:

- pipeline overview and stage/sector breakdowns;
- won value and deal prioritization;
- quarter analysis;
- work-order health and delayed work;
- billing and receivables;
- client cross-board analysis;
- leadership brief metrics;
- data-quality findings.

The LLM/provider layer, when enabled, must not recalculate these metrics from raw records.

## Founder Copilot

The canonical backend is:

```text
POST /api/chat
Content-Type: application/json

{"message":"What is our current open pipeline?"}
```

The backend validates request size/schema, creates request IDs, applies rate limiting, maps supported founder questions into deterministic query plans, returns clarification when a request is ambiguous, and emits a controlled `AgentResponse` envelope.

Examples of supported question families include pipeline, won value, work-order health, receivables, data health, leadership brief, quarter analysis, client cross-board questions, and deal prioritization.

## Security model

- monday.com credentials are server-only and must never use a `NEXT_PUBLIC_` prefix.
- The monday client imports `server-only` and rejects mutation operations.
- `/api/chat` uses strict JSON/schema validation and bounded message/request sizes.
- User/source data is treated as untrusted data rather than instructions.
- API errors are converted to controlled public responses.
- Security headers are configured in `next.config.ts`.
- Chat requests are rate limited and carry request IDs for logs/troubleshooting.

## Data-quality strategy

Skylark Command does not silently coerce every bad source value into a plausible number. Normalization records data-quality issues and the analytics layer can surface missing, malformed, or unmapped data as caveats. Cross-board analysis uses normalized client identifiers rather than assuming display names are perfectly aligned.

## Pages / features

These are the release routes the integrated candidate is expected to expose:

| Route | Purpose |
| --- | --- |
| `/` | Executive overview |
| `/pipeline` | Pipeline analysis |
| `/operations` | Work-order execution, billing and receivables |
| `/leadership` | Leadership brief |
| `/data-health` | Data-quality findings |
| `/copilot` | Founder Copilot |
| `/api/health` | Configuration/health snapshot |
| `/api/chat` | Canonical founder-question API |

On the release-ops branch before UI integration, only the backend baseline routes are guaranteed. The smoke test intentionally fails missing release pages.

## Local setup

Prerequisite: Node.js **20.9 or later** (compatible with the current Next.js 16 baseline).

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Environment variables

Required in local runtime and the final Vercel environment:

```text
MONDAY_API_TOKEN=
MONDAY_DEALS_BOARD_ID=
MONDAY_WORK_ORDERS_BOARD_ID=
```

Optional/reserved by the current Agent 3 provider contract:

```text
AI_API_KEY=
```

Only configure `AI_API_KEY` if the final integrated backend actually uses that provider key. Keep every secret server-side. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for release configuration.

## Tests

```bash
npm test
npm run lint
npm run build
```

After a preview or production candidate is reachable:

```bash
BASE_URL="https://your-preview.example" npm run smoke
```

To include the safe `/api/chat` check:

```bash
BASE_URL="https://your-preview.example" SMOKE_CHAT=1 npm run smoke
```

The release workflow also runs install, tests, lint, and build without deploying.

## Decision Log

Architecture and product decisions are tracked in [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md). Shared BI contracts are documented in [`docs/AGENT_1_CONTRACTS.md`](docs/AGENT_1_CONTRACTS.md).

## Deployment

Deployment instructions and release risks are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Submission sign-off is tracked in [`docs/SUBMISSION_CHECKLIST.md`](docs/SUBMISSION_CHECKLIST.md).

Agent 6 does **not** deploy production. MASTER CHAT should deploy only after Agent 4 integration and Agent 5 release QA are green.

## Evaluator demo questions

Use questions that exercise both deterministic metrics and ambiguity handling:

1. `What is our current open pipeline?`
2. `Show me pipeline by stage.`
3. `How much value have we won?`
4. `Which deals need attention?`
5. `How healthy are our work orders?`
6. `What are our receivables?`
7. `Give me a leadership brief.`
8. `What data-quality issues should I know about?`
9. `Which clients have both open opportunities and active projects?`
10. `Who are our best customers?` — expected to trigger a clarification instead of inventing a definition.

## Known limitations

- The final release still depends on successful integration of the product UI with the canonical `/api/chat` backend.
- Availability and latency depend on monday.com and network conditions.
- monday requests currently use a 12-second per-attempt timeout with retries; slow paginated upstream responses can approach platform function-duration limits and must be checked on Vercel.
- `/api/health` verifies configuration presence; it does not perform a live monday.com dependency probe.
- The current chat rate limiter is in-memory/process-local, so it is a safety guard rather than a globally coordinated distributed rate limiter across every serverless instance.
- Optional external AI-provider behavior must be re-documented if the final Agent 3 integration adds provider-specific variables or runtime requirements.
