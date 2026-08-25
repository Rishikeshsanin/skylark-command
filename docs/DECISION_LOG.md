# Decision Log

## 2026-08-25 — Deterministic BI before LLM

**Decision:** All business arithmetic, filtering, joins, risk flags, and aggregations are implemented in TypeScript. LLMs may interpret or narrate structured results but do not calculate metrics.

**Reason:** Founder-facing BI requires repeatable answers and testable calculations.

## 2026-08-25 — Live monday.com as runtime source

**Decision:** Runtime data is fetched from monday.com with pagination through a server-only GraphQL query client. Excel/CSV source files are not embedded in runtime code.

**Reason:** The product requirement is live monday data, and hardcoded assignment data would become stale.

## 2026-08-25 — Read-only monday boundary

**Decision:** The shared monday client rejects any GraphQL document containing a mutation and exposes query/fetch helpers only.

**Reason:** The hiring assignment explicitly requires read-only source access.

## 2026-08-25 — Nulls remain unknown

**Decision:** Missing or malformed numeric/date values normalize to `null`, with quality issues when relevant. Analytics never silently fabricate replacements.

**Reason:** The source is intentionally messy; invented defaults would create false executive confidence.

## 2026-08-25 — Cross-board client normalization

**Decision:** Known company-code formats are normalized deterministically (`WOCOMPANY_002 -> COMPANY002`, `COMPANY_002 -> COMPANY002`). Unknown formats are only trimmed/upper-cased, not fuzzily guessed.

**Reason:** Most Work Order customers can be joined reliably while avoiding accidental false matches.

## 2026-08-25 — Explicit time reference

**Decision:** Delay/staleness/risk calculations accept `asOfDate` from the caller instead of reading the clock internally.

**Reason:** This keeps analytics deterministic and unit-testable.
