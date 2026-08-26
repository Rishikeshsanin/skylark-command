# 60–90 Second Demo

This flow is designed for a recruiter, engineering manager, or product-minded technical interviewer. The goal is not to show every screen; it is to make the product thesis obvious quickly.

## Before presenting

- Use a deployment that corresponds to the V2 source state you intend to discuss.
- Confirm live source configuration is healthy.
- If demonstrating Change Intelligence, confirm the temporal store contains at least two successful snapshots spanning the requested period.
- Do not seed or describe mock history as real product history.
- Gemini is optional; a deterministic fallback is acceptable and demonstrates the trust boundary.

## Primary 75-second flow

| Time | Action | Story |
| --- | --- | --- |
| **0:00–0:12** | Open **Overview** | “Skylark Command is a trust-native executive decision intelligence platform over live monday.com commercial and operational data. The key design choice is that TypeScript owns the numbers; AI can help interpret them.” Point to freshness/coverage/attention signals. |
| **0:12–0:25** | Open Copilot and ask **`What changed since last week?`** | “Instead of only answering current-state BI questions, V2 can compare point-in-time snapshots and identify material changes.” If history is insufficient, use the alternate path below. |
| **0:25–0:35** | Open evidence / trust details | “Every material answer can carry its metric semantics, source snapshots, record evidence, coverage, and caveats. Change results distinguish deterministic facts from statistical estimates and generated interpretation.” |
| **0:35–0:47** | Open a **Customer 360** page | “Commercial and operational records are joined only through exact normalized customer keys—no fuzzy AI matching. That gives one customer view across pipeline, execution, billing/collections, and receivables.” |
| **0:47–0:58** | Ask a contribution follow-up, e.g. **`Which customers are behind those?`** | “The Copilot resolves the previous analytical scope through structured context and dispatches a deterministic customer-contribution tool rather than making up a ranking.” |
| **0:58–1:09** | Run/show **Scenario Lab** | “Scenarios clone the baseline, apply validated assumptions, rerun the same analytics, and show baseline/scenario/delta. Nothing is written back to monday.com.” |
| **1:09–1:18** | Open **Data Health** | “The product also shows where the source is incomplete. Unknown values stay unknown, so the system can say what it knows and what it does not.” |
| **1:18–1:25** | Close | “The philosophy is: ask what changed, see why, verify the evidence, then decide what happens next.” |

## Alternate path: insufficient historical data

If `What changed since last week?` cannot find a valid comparison baseline, **keep that result on screen**. It is useful proof of the trust model.

Say:

> “Historical intelligence requires real point-in-time snapshots. This environment does not yet have enough coverage for that interval, so Skylark refuses to manufacture a previous state.”

Then continue with:

1. `Which sector has the largest open pipeline?`
2. inspect evidence/coverage;
3. open Customer 360;
4. ask `Which customers are behind those?` or another contribution follow-up;
5. show Scenario Lab;
6. finish with Data Health.

This path still demonstrates deterministic analytics, typed tool orchestration, structured multi-turn context, exact joins, scenario isolation, and trust evidence.

## Alternate path: Gemini unavailable

Do not stop the demo.

Say:

> “The language provider is optional. Business analytics execute deterministically first, so provider failure changes narration quality rather than the underlying numbers.”

Then show the structured result and its evidence.

## Strong follow-up prompts

Use prompts that reveal architecture rather than only returning a number:

- `What changed in pipeline?`
- `Which customers changed the most?`
- `What changed in receivables?`
- `Which sector has the largest open pipeline?`
- `Show only deals above ₹1Cr.`
- `Which customers are behind those?`
- `Compare that with last quarter.`
- `Show customer COMPANY001.`
- `What data should I not trust?`

Only use a customer or record identifier that exists in the configured source environment.

## What to emphasize in technical discussion

### Why deterministic analytics?
Because executive metrics need reproducibility, unit tests, stable semantics, and auditable failure behavior. LLMs are used where flexibility helps—not where arithmetic authority would create risk.

### Why snapshots instead of reconstructing history?
Current-state SaaS APIs often cannot answer “what changed?” retrospectively. Point-in-time snapshots create an honest temporal evidence base without pretending the source is an event log.

### Why typed tools?
They turn a language model from an unrestricted problem solver into a bounded planner over approved business operations.

### Why exact joins?
A false customer join is worse than an unmatched customer in an executive system. Unknown identity stays explicit.

### Is Scenario Lab predictive AI?
No. It is deterministic assumption analysis. Predictive ML is intentionally a future direction that requires sufficient historical training/evaluation data.

## Demo hygiene

- Do not call known-only monetary metrics complete when source values are missing.
- Do not claim V2 history is live unless the deployed environment has temporal snapshots.
- Do not present the existing pre-V2 screenshot folder as V2 proof.
- Do not expose environment variables, request headers, browser extensions, personal tabs, or credentials in captures.
- Prefer one strong answer with visible evidence over many superficial prompts.
