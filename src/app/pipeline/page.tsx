import type { Metadata } from "next";
import { loadPipelineViewData } from "@/components/data/server-dashboard-data";
import { PipelineDashboard } from "@/components/pipeline/pipeline-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { SourceStatus } from "@/components/ui/source-status";
export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";
export default async function PipelinePage() {
  try {
    const data = await loadPipelineViewData();
    return <div className="page"><PageHeader eyebrow="Sales Intelligence" title="Pipeline" description="Understand pipeline value, stage distribution, sector exposure, and deals requiring attention." actions={<SourceStatus fetchedAt={data.snapshot.source.fetchedAt} boardNames={[data.snapshot.source.dealsBoardName]} />} /><PipelineDashboard metrics={data.metrics} stages={data.stages} sectors={data.sectors} risks={data.risks} largestDeals={data.largestDeals} quarters={data.quarters} /></div>;
  } catch {
    const message = "Live pipeline intelligence is temporarily unavailable. Please retry after the server connection is restored.";
    return <div className="page"><PageHeader eyebrow="Sales Intelligence" title="Pipeline" description="Understand pipeline value, stage distribution, sector exposure, and deals requiring attention." /><PipelineDashboard error={message} /></div>;
  }
}
