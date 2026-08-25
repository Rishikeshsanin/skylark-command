import type { Metadata } from "next";
import { loadPipelineViewData, loadSafely } from "@/components/data/server-dashboard-data";
import { PipelineDashboard } from "@/components/pipeline/pipeline-dashboard";
import { DEFAULT_CURRENCY_CODE } from "@/components/ui/formatters";
import { PageHeader } from "@/components/ui/page-header";
import { SourceStatus } from "@/components/ui/source-status";
export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";
export default async function PipelinePage() {
  const result = await loadSafely(loadPipelineViewData, "Live pipeline intelligence is temporarily unavailable. Please retry after the server connection is restored.");
  if (!result.data) {
    return <div className="page"><PageHeader eyebrow="Sales Intelligence" title="Pipeline" description="Understand pipeline value, stage distribution, sector exposure, and data coverage." /><PipelineDashboard error={result.error} /></div>;
  }
  const data = result.data;
  return <div className="page"><PageHeader eyebrow="Sales Intelligence" title="Pipeline" description="Understand pipeline value, stage distribution, sector exposure, and data coverage." actions={<SourceStatus fetchedAt={data.snapshot.source.fetchedAt} boardNames={[data.snapshot.source.dealsBoardName]} recordsAnalyzed={data.snapshot.deals.length} />} /><PipelineDashboard metrics={data.metrics} stages={data.stages} sectors={data.sectors} risks={data.risks} largestDeals={data.largestDeals} quarters={data.quarters} currency={DEFAULT_CURRENCY_CODE} /></div>;
}
