import { detectChangeIntelligence } from "@/lib/analytics";
import type { BusinessDataSnapshot } from "@/lib/business-data";
import { loadAvailableChangeSnapshots } from "@/lib/change-history";
import { assessEvidenceQuality } from "@/lib/semantic/evidence-quality";
import { buildAnswerLineage } from "@/lib/semantic/lineage";
import { buildTrustResponse } from "@/lib/semantic/trust";
import type { TrustResponse } from "@/lib/semantic/types";
import type { ChangeIntelligenceResult, ChangeSignal, HistoricalBusinessSnapshot } from "@/types";
import type { AnalysisFilter, BaseToolCall, MetricId, ToolEvidence } from "./contracts";

export type ChangeIntelligenceCall = Extract<BaseToolCall, { tool: "getChangeIntelligence" }>;

export interface ChangeIntelligenceToolExecution {
  result: { data: ChangeIntelligenceResult; caveats: string[] };
  semanticMetricIds: MetricId[];
  filters: AnalysisFilter[];
  evidence: ToolEvidence;
  semanticTrust: TrustResponse;
  snapshotId: string;
  sourceFetchedAt: string;
}

function issueCounts(snapshot: BusinessDataSnapshot) {
  return snapshot.normalizationIssues.reduce(
    (counts, issue) => ({ ...counts, [issue.severity]: counts[issue.severity] + 1 }),
    { info: 0, warning: 0, error: 0 },
  );
}

function metricIdsForFocus(focus: ChangeIntelligenceCall["args"]["focus"]): MetricId[] {
  if (focus === "pipeline") return ["open_pipeline_value"];
  if (focus === "receivables") return ["receivables"];
  return ["open_pipeline_value", "receivables"];
}

function signalMatchesFocus(signal: ChangeSignal, focus: ChangeIntelligenceCall["args"]["focus"]): boolean {
  if (focus === "all") return true;
  if (focus === "customers") return signal.type === "customer_exposure_change";
  if (focus === "receivables") {
    return signal.type === "receivables_change" || signal.type === "billing_collection_deterioration";
  }
  return signal.type === "open_pipeline_change" ||
    signal.type === "deal_newly_won" ||
    signal.type === "deal_newly_lost" ||
    signal.type === "deal_stage_movement" ||
    signal.type === "deal_new_large_opportunity" ||
    signal.type === "deal_tentative_close_movement" ||
    signal.type === "deal_newly_stale" ||
    signal.type === "sector_concentration_change";
}

function queryStart(lookbackDays: number | undefined, now: Date): string | undefined {
  if (lookbackDays === undefined) return undefined;
  return new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
}

function snapshotForTrust(latest: HistoricalBusinessSnapshot, baseline: BusinessDataSnapshot): BusinessDataSnapshot {
  return {
    deals: latest.deals,
    workOrders: latest.workOrders,
    normalizationIssues: latest.normalizationIssues ?? [],
    source: {
      ...baseline.source,
      fetchedAt: latest.capturedAt,
      dataMode: latest.snapshotId.startsWith("live:") ? "live" : "temporal",
    },
  };
}

function uniqueEvidence(signals: ChangeSignal[], sourceSnapshotIds: string[]): ToolEvidence {
  const dealItemIds = [...new Set(signals.flatMap((signal) => signal.evidence.dealItemIds))].sort();
  const workOrderItemIds = [...new Set(signals.flatMap((signal) => signal.evidence.workOrderItemIds))].sort();
  return {
    dealItemIds: dealItemIds.slice(0, 50),
    workOrderItemIds: workOrderItemIds.slice(0, 50),
    dealCount: dealItemIds.length,
    workOrderCount: workOrderItemIds.length,
    sourceSnapshotIds: [...new Set(sourceSnapshotIds)].sort(),
  };
}

export async function executeChangeIntelligenceTool(
  call: ChangeIntelligenceCall,
  baseline: BusinessDataSnapshot,
  now = new Date(),
): Promise<ChangeIntelligenceToolExecution> {
  const focus = call.args.focus ?? "all";
  const snapshots = await loadAvailableChangeSnapshots(undefined, {
    fromSnapshotTime: queryStart(call.args.lookbackDays, now),
    limit: call.args.limit ?? 50,
    order: "desc",
  });
  const detected = detectChangeIntelligence(snapshots);
  const signals = detected.signals.filter((signal) => signalMatchesFocus(signal, focus));
  const caveats = [...detected.caveats];
  if (focus !== "all") {
    caveats.push(`Change Intelligence signals are deterministically filtered to the ${focus} focus requested by the typed tool call.`);
  }
  if (call.args.lookbackDays !== undefined) {
    caveats.push(`Historical snapshot enumeration is bounded to the previous ${call.args.lookbackDays} day(s) from execution time.`);
  }
  const result: ChangeIntelligenceResult = { ...detected, signals, caveats };
  const latest = snapshots.at(-1);
  const trustSnapshot = latest ? snapshotForTrust(latest, baseline) : baseline;
  const semanticMetricIds = metricIdsForFocus(focus);
  const sourceSnapshotIds = snapshots.map((snapshot) => snapshot.snapshotId);
  const lineage = buildAnswerLineage({
    metricIds: semanticMetricIds,
    snapshot: trustSnapshot,
    analysisTimestamp: now.toISOString(),
  });
  const historyCovered = detected.uniqueSnapshotCount >= 2;
  const quality = assessEvidenceQuality({
    lineage,
    sourceQualityIssues: issueCounts(trustSnapshot),
    temporalCoverage: {
      requested: true,
      covered: historyCovered,
      reason: historyCovered
        ? `${detected.uniqueSnapshotCount} successful unique snapshot(s) support the historical comparison.`
        : "Fewer than two unique successful snapshots are available, so no historical comparison baseline is fabricated.",
    },
  });

  return {
    result: { data: result, caveats },
    semanticMetricIds,
    filters: [],
    evidence: uniqueEvidence(signals, sourceSnapshotIds),
    semanticTrust: buildTrustResponse(lineage, quality),
    snapshotId: detected.toSnapshotId ?? latest?.snapshotId ?? `live:${baseline.source.fetchedAt}`,
    sourceFetchedAt: detected.timeWindow.to ?? latest?.capturedAt ?? baseline.source.fetchedAt,
  };
}
