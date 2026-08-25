# Decision Log

## 2026-08-25 — Deterministic BI before LLM

**Decision:** All business arithmetic, filtering, joins, risk flags, and aggregations are implemented in TypeScript. LLMs may interpret or narrate structured results but do not calculate metrics.

**Reason:** Founder-facing BI requires repeatable answers and testable calculations.

## 2026-08-25 — Gemini is explanation-only

**Decision:** Google Gemini (`gemini-2.5-flash-lite`) may generate qualitative executive explanation only. `GEMINI_API_KEY` is preferred and `AI_API_KEY` is backward-compatible fallback. Deterministic `AgentResponse.data` remains authoritative even if Gemini is unavailable or fails.

**Reason:** Provider availability or model wording must never determine business arithmetic.

## 2026-08-25 — Numeric/digit trust boundary

**Decision:** Generated executive prose is schema-validated to exclude numeric characters. Numeric business truth is rendered from deterministic analytics data, never copied from model prose.

**Reason:** This prevents the explanation layer from inventing, rounding, or silently changing founder-facing metrics.

## 2026-08-25 — Live monday.com as runtime source

**Decision:** Runtime data is fetched from monday.com with pagination through a server-only GraphQL query client. Excel/CSV source files are not embedded in runtime code.

**Reason:** The product requirement is live monday data, and hardcoded assignment data would become stale.

## 2026-08-25 — Read-only monday boundary

**Decision:** The shared monday client rejects any GraphQL document containing a mutation and exposes query/fetch helpers only.

**Reason:** The hiring assignment explicitly requires read-only source access.

## 2026-08-25 — Nulls remain unknown and monetary totals are known-only

**Decision:** Missing or malformed numeric/date values normalize to `null`, with quality issues when relevant. Analytics never silently fabricate replacements. Monetary sums such as won value, open pipeline, customer deal values, and receivables sum known values only; UI language and known/unknown counts disclose incompleteness where available.

**Reason:** The source is intentionally messy; invented defaults or complete-total language would create false executive confidence.

## 2026-08-25 — Cross-board client normalization uses no fuzzy matching

**Decision:** Known company-code formats are normalized deterministically (`WOCOMPANY_002 -> COMPANY002`, `COMPANY_002 -> COMPANY002`). Unknown formats are only trimmed/upper-cased, not fuzzily guessed. Cross-board presence uses exact normalized-key intersection and counts unique client keys rather than Work Order rows.

**Reason:** Most Work Order customers can be joined reliably while avoiding accidental false matches or inflated unmatched counts.

## 2026-08-25 — Customer ranking definitions are explicit

**Decision:** “Best customers” is ambiguous and requires one of four exact definitions: highest known won value, largest known active pipeline, best project execution, or combined commercial + operational importance. Clarification selections are controlled exact matches and dispatch only to deterministic ranking functions.

**Reason:** The product must not silently invent a ranking objective or fuzzy-select a customer-ranking definition.

## 2026-08-25 — Current-quarter and latest-period behavior

**Decision:** Supported current-quarter analytics use deterministic Agent 1 period functions. If the requested current period has no usable records, analytics preserve a no-data state and expose the latest available period rather than reporting a fake zero.

**Reason:** Zero and unavailable data are materially different executive conclusions.

## 2026-08-25 — Explicit time reference

**Decision:** Delay/staleness/risk calculations accept `asOfDate` from the caller instead of reading the clock internally.

**Reason:** This keeps analytics deterministic and unit-testable.
