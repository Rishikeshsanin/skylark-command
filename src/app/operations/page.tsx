import type { Metadata } from "next";
import { loadOperationsViewData } from "@/components/data/server-dashboard-data";
import { OperationsDashboard } from "@/components/operations/operations-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { SourceStatus } from "@/components/ui/source-status";
export const metadata: Metadata = { title: "Operations" };
export const dynamic = "force-dynamic";
export default async function OperationsPage() {
  try {
    const data = await loadOperationsViewData();
    return <div className="page"><PageHeader eyebrow="Work Order Intelligence" title="Operations" description="Monitor execution posture, billing progress, receivables, and operational bottlenecks." actions={<SourceStatus fetchedAt={data.snapshot.source.fetchedAt} boardNames={[data.snapshot.source.workOrdersBoardName]} />} /><OperationsDashboard health={data.health} sectors={data.sectors} /></div>;
  } catch {
    const message = "Live Work Order intelligence is temporarily unavailable. Please retry after the server connection is restored.";
    return <div className="page"><PageHeader eyebrow="Work Order Intelligence" title="Operations" description="Monitor execution posture, billing progress, receivables, and operational bottlenecks." /><OperationsDashboard error={message} /></div>;
  }
}
