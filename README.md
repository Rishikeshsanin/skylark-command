# Skylark Command

Skylark Command is a founder-facing business intelligence control room for live monday.com Deals and Work Orders data. It combines deterministic analytics, an executive dashboard suite, and a secured Founder Copilot whose AI layer may explain results but never owns the business arithmetic.

> **Release status:** RC2 integration candidate on `agent-4-integration`. This repository has **not** been deployed by the integration agent. Production release requires red-team retest and explicit release approval.

## Core product

- Executive overview with Founder Attention Feed
- Pipeline analysis by stage, sector, and supported periods
- Operations, billing, collections, and receivables health
- Leadership Brief
- Data Health / deterministic quality findings
- Founder Copilot with canonical `POST /api/chat`
- Customer ranking clarification with deterministic ranking definitions
- Source provenance, INR-aware presentation, retry states, and structured result rendering

## Architecture

```text
monday.com Deals + Work Orders
          │
          ▼
 server-only read-only client
          │
          ▼
 normalization + quality flags
          │
          ▼
 deterministic BI / rankings / attention / periods
          │
     ┌────┴───────────────┐
     ▼                    ▼
 dashboards            POST /api/chat
                           │
                           ▼
                  planner + dispatcher
                           │
                           ▼
                 deterministic result.data
                           │
                 ┌─────────┴─────────┐
                 ▼                   ▼
        deterministic fallback   Gemini explanation
                                 (optional)
```

`response.data` is authoritative. Gemini may add qualitative executive explanation only. If Gemini is missing, times out, is rate-limited, or returns an invalid response, the business request still uses deterministic analytics and falls back safely.

## Deterministic analytics

The analytics layer owns calculations including:

- pipeline overview and open pipeline value;
- stage and sector breakdowns;
- supported current-quarter / explicit-quarter / latest-available period analytics;
- won value and risky-deal prioritization;
- Work Order health, billing, collections, and receivables;
- cross-board client intelligence;
- customer rankings by won value, active pipeline, project execution, or combined commercial + operational importance;
- Founder Attention Feed for commercial, delivery, AR, stale-deal, and concentration risks;
- Leadership Brief;
- Data Health and source-quality caveats.

Missing values stay unknown. Periods with no usable records do not become fake zero performance; the deterministic period layer exposes no-data state and latest-available context when available.

## Founder Copilot

The only chat backend is:

```text
POST /api/chat
Content-Type: application/json

{"message":"Which sector has the largest open opportunity?"}
```

The API applies strict request validation, bounded payload sizes, request IDs, safe errors, rate limiting, server-only data access, prompt-injection boundaries, and the deterministic planner/dispatcher.

Examples:

- `Which sector has the largest open opportunity?`
- `What data should I not trust?`
- `Mining sector this quarter`
- `Which projects need leadership attention?`
- `Who are our best customers?`
- `Prepare a leadership brief.`

Ambiguous customer ranking asks for one of four explicit definitions:

1. Highest won value
2. Largest active pipeline
3. Best project execution
4. Combined commercial + operational importance

All four resolve to deterministic ranking functions.

## Gemini provider

The optional executive explanation provider is Google Gemini using:

```text
gemini-2.5-flash-lite
```

Server key precedence:

1. `GEMINI_API_KEY` — preferred
2. `AI_API_KEY` — backward-compatible fallback only when `GEMINI_API_KEY` is unset

Neither key may be exposed to client code or use a `NEXT_PUBLIC_` prefix.

## monday.com integration

Runtime data comes from monday.com. The data client:

- imports `server-only`;
- reads credentials from server environment variables;
- rejects GraphQL mutation operations;
- uses query-only access;
- uses `cache: "no-store"`;
- paginates board data;
- normalizes records before analytics;
- does not hardcode business datasets.

## Environment variables

Required:

```text
MONDAY_API_TOKEN=
MONDAY_DEALS_BOARD_ID=
MONDAY_WORK_ORDERS_BOARD_ID=
```

Optional AI explanation provider:

```text
GEMINI_API_KEY=
AI_API_KEY=
```

`GEMINI_API_KEY` wins when both are configured. Keep all secrets server-side. `.env.example` contains names/placeholders only.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Executive overview and Founder Attention |
| `/copilot` | Founder Copilot |
| `/pipeline` | Pipeline intelligence |
| `/operations` | Work Order / billing / receivables health |
| `/leadership` | Leadership Brief |
| `/data-health` | Deterministic data-quality findings |
| `/api/health` | Configuration/health metadata |
| `/api/chat` | Canonical Founder Copilot API |

There is no competing `/api/copilot` backend.

## Local setup

Node.js 20.9+ is required.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Quality gates

```bash
npm install
npm test
npm run lint
npm run build
```

`npm test` includes both the deterministic BI suite and the Vitest backend/security/evaluator suites, including the Agent 5 release regression tests.

For a reachable candidate:

```bash
BASE_URL="https://your-preview.example" npm run smoke
```

Optional safe chat smoke:

```bash
BASE_URL="https://your-preview.example" SMOKE_CHAT=1 npm run smoke
```

## Security model

- Server-only monday and Gemini credentials
- Query-only/read-only monday client
- Strict `/api/chat` JSON schema and size limits
- Rate limiting
- Request IDs
- Safe public error envelopes
- CSP and additional security headers through `next.config.ts`
- Untrusted user/source data separated from system instructions
- No LLM arithmetic for authoritative business metrics

## Release documentation

- `docs/AGENT_1_CONTRACTS.md` — deterministic BI contracts
- `docs/RELEASE_QA.md` — red-team / release evaluator guidance
- `docs/DEPLOYMENT.md` — deployment readiness and environment configuration
- `docs/SUBMISSION_CHECKLIST.md` — final submission gate
- `docs/DECISION_LOG.md` — architecture/product decisions

## Release policy

Agent integration does not merge `main` and does not deploy. The approved RC must pass tests, lint, production build, secret scan, browser/API smoke, and red-team retest before MASTER CHAT decides whether to merge or deploy.
