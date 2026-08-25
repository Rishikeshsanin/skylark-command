import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { loadExecutiveViewData } from "@/components/data/server-dashboard-data";
import { PageHeader } from "@/components/ui/page-header";
import { SourceStatus } from "@/components/ui/source-status";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  try {
    const data = await loadExecutiveViewData();
    return <div className="page"><PageHeader eyebrow="Executive Command Center" title="Overview" description="A founder-level view of commercial momentum, delivery health, receivables, and data quality." actions={<SourceStatus fetchedAt={data.snapshot.source.fetchedAt} boardNames={[data.snapshot.source.dealsBoardName, data.snapshot.source.workOrdersBoardName]} />} /><OverviewDashboard pipeline={data.pipeline} workOrders={data.workOrders} sectors={data.sectors} clients={data.clients} dataQuality={data.dataQuality} /></div>;
  } catch {
    const message = "Live business intelligence is temporarily unavailable. Please retry after the server connection is restored.";
    return <div className="page"><PageHeader eyebrow="Executive Command Center" title="Overview" description="A founder-level view of commercial momentum, delivery health, receivables, and data quality." /><OverviewDashboard error={message} /></div>;
  }
}
