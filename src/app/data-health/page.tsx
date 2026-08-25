import type { Metadata } from "next";
import { loadDataHealthViewData } from "@/components/data/server-dashboard-data";
import { DataHealthDashboard } from "@/components/data-health/data-health-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { SourceStatus } from "@/components/ui/source-status";
export const metadata: Metadata = { title: "Data Health" };
export const dynamic = "force-dynamic";
export default async function DataHealthPage() {
  try {
    const data = await loadDataHealthViewData();
    return <div className="page"><PageHeader eyebrow="Trust & Transparency" title="Data Health" description="See the source-data limitations, normalization notices, and quality signals behind executive intelligence." actions={<SourceStatus fetchedAt={data.snapshot.source.fetchedAt} boardNames={[data.snapshot.source.dealsBoardName, data.snapshot.source.workOrdersBoardName]} />} /><DataHealthDashboard report={data.report} /></div>;
  } catch {
    const message = "Live data-quality intelligence is temporarily unavailable. Please retry after the server connection is restored.";
    return <div className="page"><PageHeader eyebrow="Trust & Transparency" title="Data Health" description="See the source-data limitations, normalization notices, and quality signals behind executive intelligence." /><DataHealthDashboard error={message} /></div>;
  }
}
