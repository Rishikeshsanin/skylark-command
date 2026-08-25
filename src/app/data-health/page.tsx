import type { Metadata } from "next";
import { loadDataHealthViewData, loadSafely } from "@/components/data/server-dashboard-data";
import { DataHealthDashboard } from "@/components/data-health/data-health-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { SourceStatus } from "@/components/ui/source-status";
export const metadata: Metadata = { title: "Data Health" };
export const dynamic = "force-dynamic";
export default async function DataHealthPage() {
  const result = await loadSafely(loadDataHealthViewData, "Live data-quality intelligence is temporarily unavailable. Please retry after the server connection is restored.");
  if (!result.data) {
    return <div className="page"><PageHeader eyebrow="Trust & Transparency" title="Data Health" description="See source-data limitations, normalization notices, and quality signals behind executive intelligence." /><DataHealthDashboard error={result.error} /></div>;
  }
  const data = result.data;
  const recordsAnalyzed = data.snapshot.deals.length + data.snapshot.workOrders.length;
  return <div className="page"><PageHeader eyebrow="Trust & Transparency" title="Data Health" description="See source-data limitations, normalization notices, and quality signals behind executive intelligence." actions={<SourceStatus fetchedAt={data.snapshot.source.fetchedAt} boardNames={[data.snapshot.source.dealsBoardName, data.snapshot.source.workOrdersBoardName]} recordsAnalyzed={recordsAnalyzed} />} /><DataHealthDashboard report={data.report} /></div>;
}
