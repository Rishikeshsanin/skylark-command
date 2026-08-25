# Skylark Command — Release QA Status

**QA lineage:** Agent 5 Release QA + independent Agent 7 evaluator review  
**Date:** 2026-08-25  
**Blocked release:** RC2 `ee027ec57c4b54409f462a1bf14e0a014709f020`  
**Hotfix branch:** `release/rc3-hotfix`

## Current release state

**RC2 BLOCKED by Agent 5.** Agent 7 independently confirmed the remaining evaluator-visible issues around clarification completion, sector ranking semantics, authoritative metric visibility, monetary completeness, and cross-board unique-client semantics.

**RC3 hotfix is pending independent retest.** This document does not claim Agent 5 or Agent 7 approval for RC3. RC3 may be promoted only after the targeted evaluator retest passes.

RC2 remains recoverable at its immutable SHA. RC3 is a narrow evaluator hotfix and must not change the deterministic/AI security architecture.

## Immutable live monday acceptance baseline

These are acceptance criteria, not hardcoded runtime values. Never change them merely to make tests pass.

| Metric | Expected configured-live value |
| --- | ---: |
| Deals | 346 |
| Work Orders | 176 |
| Open deals | 49 |
| Won deals | 165 |
| Known open pipeline | 688152293.17 |
| Known won value | 95038938.98 |
| Known-value won deals | 64 |
| Unknown-value won deals | 101 |
| Receivables | 36291748.87 |
| Unique Work Order client keys | 51 |
| Matched unique Work Order client keys | 50 |
| Unmatched unique Work Order client keys | 1 |
| Unmatched client key | `COMPANY042` |

CI intentionally has no real monday or Gemini credentials, so configured-live acceptance remains a separate pre-submission check.

## RC3 targeted P0 hotfix contract

### P0-1 — Customer ranking clarification completion

`Who are our best customers?` must clarify with exactly these definitions:

- Highest won value
- Largest active pipeline
- Best project execution
- Combined commercial + operational importance

The UI sends the selected canonical option. The planner also accepts only the controlled equivalent forms `Answer: <option>` and the exact clarification question followed by `Answer: <option>`. Arbitrary/fuzzy ranking selection is not permitted. Every option dispatches to Agent 1 deterministic ranking logic.

### P0-2 — Largest open opportunity semantics

`Which sector has the largest open opportunity?`, `Which sector has the biggest pipeline?`, and `What sector has the most open opportunity?` must order deterministic sector results by **known `openPipelineValue` descending**. General cross-commercial/operational sector ordering remains available for other views; this evaluator semantic uses an explicit planner focus and does not hardcode a sector answer.

### P0-3 — Authoritative Copilot metric visibility

Founder Copilot must visibly present the deterministic values relevant to the requested result rather than relying on the first few primitive object fields. Presentation code may format supplied values but may not calculate business metrics.

Required visible result families include pipeline coverage, receivables/billing/collections, customer-ranking basis and nested monetary/operational values, sector/stage/period results, Founder Attention, Leadership Brief, and Data Health.

### P0-4 — Known-only won-value coverage

`wonValue` is a sum of known won Deal values, not complete lifetime revenue when won Deal values are missing. `PipelineMetrics` exposes known and unknown won-value Deal counts. UI and Copilot language must call the monetary value **known won value** or otherwise show its coverage explicitly.

### P0-5 — Unique cross-board client semantics

`Which customers appear in both boards?` means unique exact normalized client keys represented in both Deals and Work Orders. It does not mean only clients with an open Deal plus active Work Order. The deterministic summary exposes unique Work Order key count, matched count, unmatched count, unmatched key evidence, and matched-client intelligence. No fuzzy matching is allowed.

`DataQualityReport.unmappedWorkOrderClients` counts unique unmatched normalized client keys. Row-level issues may still be emitted for each affected Work Order as evidence.

### P0-6 — Monetary completeness language

Known-only monetary sums must not be described as complete totals when source records are unknown. Existing known/unknown record counts are displayed where available. No completeness percentages are invented.

## Security and architecture invariants

RC3 must preserve all of the following:

- live monday.com data at runtime;
- read-only monday GraphQL boundary and mutation rejection;
- deterministic arithmetic/filtering/ranking/join logic;
- Google Gemini only for qualitative explanation;
- deterministic fallback when Gemini is unavailable;
- model prose cannot become numeric business truth;
- server-only monday/Gemini secrets;
- canonical `POST /api/chat` as the only chat endpoint;
- strict request validation, rate limiting, request IDs, controlled errors, CSP/security headers, and prompt/untrusted-data boundaries.

## Authentication limitation for the hiring preview

The evaluator-facing hosted preview intentionally does **not** add application authentication in this RC3 hotfix. Adding auth/SSO immediately before evaluation risks blocking evaluator access and is outside the narrow hotfix scope. Production hardening should add organization authentication/SSO, distributed rate limiting, and deployment-level access controls after the hiring evaluation.

## RC3 required retest matrix

Before RC3 can be approved, independent QA must re-run:

1. `Who are our best customers?` → click each of the four options → no clarification loop.
2. `Which sector has the largest open opportunity?` → known open pipeline ordering.
3. `What is our won value?` → authoritative known won value + missing-value coverage visible.
4. `What are our receivables?` → authoritative receivables visible, with unknown count when present.
5. `Which customers appear in both boards?` → unique normalized-key semantics.
6. `What data should I not trust?` → Data Health.
7. `Mining sector this quarter` → deterministic period-scoped analytics/latest-period behavior.
8. `Which projects need leadership attention?` → deterministic Founder Attention/risk information.
9. Desktop browser smoke at 1440×900.
10. Mobile browser smoke at 390×844.
11. `npm ci`, `npm test`, `npm run lint`, and `npm run build` all green.
12. Tracked-secret scan remains clean.

## Release decision

**Current decision: RC3 hotfix pending independent Agent 5 targeted retest.**

Do not label RC3 approved, merge it to `main`, or deploy production based on this document alone.
