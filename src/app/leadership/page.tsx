import type { Metadata } from "next";
import { loadLeadershipViewData } from "@/components/data/server-dashboard-data";
import { LeadershipBrief } from "@/components/leadership/leadership-brief";
import { PageHeader } from "@/components/ui/page-header";
import { SourceStatus } from "@/components/ui/source-status";
export const metadata: Metadata = { title: "Leadership Brief" };
export const dynamic = "force-dynamic";
export default async function LeadershipPage() {
  try {
    const data = await loadLeadershipViewData();
    return <div className="page"><PageHeader eyebrow="Leadership Brief" title="Decision-ready business brief" description="A compact executive narrative spanning pipeline, operations, receivables, attention items, and data quality." actions={<SourceStatus fetchedAt={data.snapshot.source.fetchedAt} boardNames={[data.snapshot.source.dealsBoardName, data.snapshot.source.workOrdersBoardName]} />} /><LeadershipBrief brief={data.brief} /></div>;
  } catch {
    const message = "The live leadership brief is temporarily unavailable. Please retry after the server connection is restored.";
    return <div className="page"><PageHeader eyebrow="Leadership Brief" title="Decision-ready business brief" description="A compact executive narrative spanning pipeline, operations, receivables, attention items, and data quality." /><LeadershipBrief error={message} /></div>;
  }
}
