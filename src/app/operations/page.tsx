import type { Metadata } from "next";
import { loadOperationsViewData, loadSafely } from "@/components/data/server-dashboard-data";
import { OperationsDashboard } from "@/components/operations/operations-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { SourceStatus } from "@/components/ui/source-status";
export const metadata: Metadata = { title: "Operations" };
export const dynamic = "force-dynamic";
export default async function OperationsPage() {
  const result = await loadSafely(loadOperationsViewData, "Live Work Order intelligence is temporarily unavailable. Please retry after the server connection is restored.");
  if (!result.data) {
    return <div className="page"><PageHeader eyebrow="Work Order Intelligence" title="Operations" description="Monitor execution posture, billing progress, receivables, and data confidence." /><OperationsDashboard error={result.error} /></div>;
  }
  const data = result.data;
  return <div className="page"><PageHeader eyebrow="Work Order Intelligence" title="Operations" description="Monitor execution posture, billing progress, receivables, and data confidence." actions={<SourceStatus fetchedAt={data.snapshot.source.fetchedAt} boardNames={[data.snapshot.source.workOrdersBoardName]} recordsAnalyzed={data.snapshot.workOrders.length} />} /><OperationsDashboard health={data.health} sectors={data.sectors} /></div>;
}
