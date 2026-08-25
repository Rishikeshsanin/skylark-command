# Skylark Command — Five-Minute Evaluator Demo

**Goal:** demonstrate trustworthy founder-level answers over live monday.com data without presenting incomplete data as complete.

## Before the timer

- Open the final hosted URL on the Overview page and confirm the live source state renders.
- Keep Founder Copilot ready in a second tab; use the exact prompts below.
- Do not start unless `GET /api/health` is HTTP 200 and the configured-live baseline has been checked in the UI/API behavior.
- If Gemini is unavailable, continue: deterministic data and fallback narration are expected behavior.

## Timed flow

| Time | Action | What to say / verify |
| --- | --- | --- |
| **0:00** | **Overview** | “Skylark Command reads live Deals and Work Orders from monday.com. TypeScript owns every business calculation; AI can only explain the structured result.” Point out source provenance, Founder Attention, and the separation between dashboards and source systems. |
| **0:30** | **Pipeline** | Show 49 open deals and known open pipeline of **688152293.17 INR**. Point out that monetary totals are known-only and missing values are not treated as zero. |
| **1:00** | Ask `Which sector has the largest open opportunity?` | Verify the answer ranks sectors by deterministic **known open pipeline value**, not by total opportunity count or a combined score. |
| **1:30** | Ask `Who are our best customers?` | Show the clarification instead of an invented definition. Select **Highest won value** (any canonical option is valid) and verify the result resolves without another clarification loop. Mention the four supported deterministic definitions. |
| **2:15** | Ask `What is our won value?` | Show **known won value of 95038938.98 INR** and its coverage: **64 known-value won deals; 101 unknown-value won deals**. Say explicitly: “This is not presented as complete historical revenue.” |
| **2:45** | Ask `How are we doing this quarter?` | If the current quarter has no usable records, show the honest no-data state and latest-available-period context. Do not narrate missing current-period data as zero performance. |
| **3:20** | Ask `Which projects need leadership attention?` | Show deterministic project/delivery risk evidence and explain that time-dependent flags use an explicit analysis date. |
| **3:50** | Ask `What data should I not trust?` | Show Data Health: missing/malformed values, coverage caveats, and unmapped evidence. Emphasize that unknowns remain visible. |
| **4:20** | Ask `Prepare a leadership brief.` | Show the consolidated commercial, execution, receivables, risk, and data-quality view. Connect it to the Founder Attention Feed. |
| **4:40** | **Trust and security close** | “monday access is query-only and server-side. Gemini uses `gemini-2.5-flash-lite` for narration only; `AgentResponse.data` remains numeric truth. Invalid numeric model prose or provider failure falls back deterministically.” |

## Close

> “The business value is fast founder-level answers without pretending incomplete data is complete.”

## Optional follow-ups

If the evaluator has time:

- `What are our receivables?` → known receivables baseline: **36291748.87 INR**, with unknown coverage shown when available.
- `Which customers appear in both boards?` → **51** unique Work Order client keys, **50** exact matches, and one unmatched key: `COMPANY042`.
- Choose the other customer-ranking definitions to demonstrate controlled deterministic dispatch.
- Explain that `/api/health` confirms configuration presence but is not a live monday dependency probe.

## Demo guardrails

- Do not call known won value “total revenue” or “full historical revenue.”
- Do not claim Agent 5 approval until the independent final RC3 decision is recorded.
- Do not hide provider fallback; it is evidence that analytics do not depend on Gemini.
- Do not claim production SSO/RBAC. The hiring preview access trade-off is documented in `docs/DECISION_LOG.md`.
