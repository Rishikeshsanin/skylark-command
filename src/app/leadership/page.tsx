import type { Metadata } from "next";
import { loadLeadershipViewData, loadSafely } from "@/components/data/server-dashboard-data";
import { LeadershipBrief } from "@/components/leadership/leadership-brief";
import { PageHeader } from "@/components/ui/page-header";
import { SourceStatus } from "@/components/ui/source-status";
export const metadata: Metadata = { title: "Leadership Brief" };
export const dynamic = "force-dynamic";
export default async function LeadershipPage() {
  const result = await loadSafely(loadLeadershipViewData, "The live leadership brief is temporarily unavailable. Please retry after the server connection is restored.");
  if (!result.data) {
    return <div className="page"><PageHeader eyebrow="Leadership Brief" title="Decision-ready business brief" description="Presentation-ready commercial, operational, cash, attention, and data-caveat views." /><LeadershipBrief error={result.error} /></div>;
  }
  const data = result.data;
  const recordsAnalyzed = data.snapshot.deals.length + data.snapshot.workOrders.length;
  return <div className="page"><PageHeader eyebrow="Leadership Brief" title="Decision-ready business brief" description="Presentation-ready commercial, operational, cash, attention, and data-caveat views." actions={<SourceStatus fetchedAt={data.snapshot.source.fetchedAt} boardNames={[data.snapshot.source.dealsBoardName, data.snapshot.source.workOrdersBoardName]} recordsAnalyzed={recordsAnalyzed} />} /><LeadershipBrief brief={data.brief} /></div>;
}
