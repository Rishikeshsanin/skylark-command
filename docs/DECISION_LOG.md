# Decision Log

This log records the release-shaping decisions behind Skylark Command. The goal is trustworthy founder-facing analysis over live monday.com Deals and Work Orders rather than a generic chatbot over copied spreadsheet data.

## Deterministic BI before the LLM

**Decision:** Business arithmetic, filtering, joins, rankings, period handling, risk flags, coverage counts, and aggregations are implemented in typed TypeScript analytics. The model never owns authoritative numbers.

**Why:** Leadership metrics must be reproducible, testable, and auditable. The same source snapshot must produce the same numeric answer regardless of model availability.

## Live monday.com is the runtime source of truth

**Decision:** Runtime data is fetched server-side from the two monday.com boards with pagination and `no-store`; the assignment spreadsheets are not embedded in runtime code.

**Why:** The requested product is a live conversational agent, not a static demo over hardcoded source rows.

## Read-only monday boundary

**Decision:** The monday client exposes query/fetch behavior only and rejects GraphQL containing `mutation`.

**Why:** The assistant should analyze operational data without being capable of silently editing the company system of record.

## Missing values remain unknown

**Decision:** Missing or malformed numeric/date fields normalize to `null`; known-value sums carry known/unknown record coverage and are described as known recorded values when incomplete.

**Why:** Treating missing amounts as zero or presenting partial sums as complete historical revenue creates false executive confidence.

## Exact cross-board client matching, not fuzzy guessing

**Decision:** Known company-code formats are normalized deterministically (for example `WOCOMPANY_002 -> COMPANY002`). Cross-board coverage uses exact normalized-key equality; unknown identities are not fuzzily matched.

**Why:** A false client join is more damaging than an explicit unmatched record. The product should expose unmatched keys so leadership can correct source data.

## Ambiguous customer rankings require clarification

**Decision:** “Best customers” is not assigned a hidden definition. The user must choose one of four deterministic meanings: highest won value, largest active pipeline, best project execution, or combined commercial + operational importance.

**Why:** Commercial value and delivery quality are different concepts. Asking once is safer than inventing an executive ranking criterion.

## Question semantics control ranking semantics

**Decision:** “Largest open opportunity sector” ranks by known open pipeline value only. Broader commercial/operational sector views may use different exposure ordering, but they are not reused for this wording.

**Why:** The top answer must match the metric the user actually asked for, not merely whichever sector appears first in a general dashboard ordering.

## Time-scoped questions never fabricate current performance

**Decision:** Current-quarter/explicit-quarter analysis uses dated source records. If the requested period has no usable data, Skylark Command says so, preserves caveats, and can show the latest available context rather than converting absence into zero performance.

**Why:** The provided dataset can be stale relative to the evaluation date; “no current data” and “zero performance” are materially different statements.

## Gemini is explanation-only

**Decision:** `gemini-2.5-flash-lite` is optional and receives bounded normalized deterministic results for narrative explanation. It has no monday tools, no GraphQL capability, and no authority to create metrics.

**Why:** The model adds conversational usefulness without becoming part of the numeric trust chain.

## Numeric trust boundary and deterministic fallback

**Decision:** Authoritative numbers are rendered from `response.data`. Model explanation output is schema-validated and rejected if it introduces numeric characters; provider absence, timeout, rate limits, or malformed output fall back to deterministic explanation while preserving the analytics result.

**Why:** This prevents a fluent model response from silently contradicting the tested BI layer and keeps the core product useful even when the external model is unavailable.

## Server-only credentials and bounded API surface

**Decision:** monday/Gemini credentials stay in server environment variables. `POST /api/chat` is the single chat endpoint, with request-size limits, validation, controlled errors, security headers, and rate limiting. No source secret is intentionally exposed to the browser bundle or model prompt.

**Why:** The hiring task evaluates reliability and security as well as functionality; a polished UI cannot compensate for an unsafe data boundary.

## Evaluator preview vs. production access control

**Decision:** The hiring-preview release remains directly accessible so evaluators can use the submitted URL without account provisioning. Organizational authentication/SSO and distributed rate limiting are documented as production-hardening requirements rather than added during the final assignment hotfix.

**Why:** Adding a new authentication system immediately before submission would add release risk and evaluator friction. A real internal-company production rollout should add identity, authorization, and stronger shared rate limiting before exposing sensitive business data.

## Release policy

**Decision:** Green unit/build CI is necessary but not sufficient. The release is frozen only after evaluator-journey smoke tests, independent red-team review, live monday golden-baseline checks, hosted-route checks, and final source/secrets review.

**Why:** RC2 demonstrated that all automated unit/integration tests can pass while a real clarification-button journey is still broken. Release evidence must exercise the product the way a hiring evaluator will.