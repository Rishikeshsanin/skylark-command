import { OverviewDashboard } from "@/components/overview/overview-dashboard";
import { loadExecutiveViewData, loadSafely } from "@/components/data/server-dashboard-data";
import { PageHeader } from "@/components/ui/page-header";
import { SourceStatus } from "@/components/ui/source-status";

export const dynamic = "force-dynamic";

const description = "What matters now across commercial momentum, execution, cash exposure, and data confidence.";

export default async function OverviewPage() {
  const result = await loadSafely(loadExecutiveViewData, "Live business intelligence is temporarily unavailable. Please retry after the server connection is restored.");
  if (!result.data) {
    return <div className="page"><PageHeader eyebrow="Executive Command Center" title="Overview" description={description} /><OverviewDashboard error={result.error} /></div>;
  }
  const data = result.data;
  return <div className="page"><PageHeader eyebrow="Executive Command Center" title="Overview" description={description} actions={<SourceStatus fetchedAt={data.snapshot.source.fetchedAt} boardNames={[data.snapshot.source.dealsBoardName, data.snapshot.source.workOrdersBoardName]} recordsAnalyzed={data.attention.provenance.totalRecordsAnalyzed} />} /><OverviewDashboard pipeline={data.pipeline} workOrders={data.workOrders} sectors={data.sectors} clients={data.clients} dataQuality={data.dataQuality} attentionFeed={data.attention} currency={data.attention.currencyCode} /></div>;
}
