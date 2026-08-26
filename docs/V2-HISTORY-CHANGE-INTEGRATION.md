# V2 Historical Change Intelligence Integration

## Canonical history source

Historical analytics should use `TemporalSnapshotStore.listSuccessfulSnapshots(...)` rather than direct SQL. The store query is workspace-scoped, time-bounded, result-bounded, deterministic, and exposes only analytical snapshots referenced by successful sync runs.

`createTemporalHistoricalSnapshotProvider(...)` adapts those stored snapshots to Agent 4's `HistoricalSnapshotProvider`. `loadAvailableChangeSnapshots(...)` uses the configured PostgreSQL provider when `DATABASE_URL` is available and retains the existing current-snapshot fallback when durable history is unavailable. No synthetic history is created.

Change Detective and Customer 360 already consume `loadAvailableChangeSnapshots(...)`, so they receive persisted history without duplicating change or customer analytics.

## Copilot `getChangeIntelligence` seam

This branch intentionally does not register `getChangeIntelligence` yet.

The current V2 Copilot orchestrator routes every registered tool through `legacyPlanForTool(...)` and the legacy V1 explanation contract. There is no truthful legacy intent for historical Change Intelligence, and `src/lib/agent/v2/orchestrator.ts` is concurrently owned by `v2/copilot-quality`. Mapping Change Intelligence to an unrelated legacy intent would blur the trust boundary.

After `v2/copilot-quality` is integrated, register the tool only through the typed V2 path:

1. Add `getChangeIntelligence` to the Zod tool-call schema and allowlist.
2. Execute it by loading `loadAvailableChangeSnapshots(...)` and passing those snapshots to `detectChangeIntelligence(...)`.
3. Return the deterministic/statistical `ChangeIntelligenceResult` unchanged as analytical truth.
4. Carry `sourceSnapshotIds`, Deal IDs, Work Order IDs, and caveats into the V2 evidence/trust trace.
5. Let the LLM explain the result only after deterministic execution; it must never calculate deltas, materiality, or change scores.
6. Preserve sparse/no-history caveats and never synthesize a comparison baseline.

Trust classification remains:

- **FACT** — deterministic business analytics and persisted source records.
- **ESTIMATE** — explicit statistical methods such as median/MAD materiality assessment.
- **INTERPRETATION** — optional LLM wording after the analytical result exists.
