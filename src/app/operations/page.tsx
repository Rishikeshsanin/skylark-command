import type { Metadata } from "next";
import { loadOperationsViewData, loadSafely } from "@/components/data/server-dashboard-data";
import { OperationsDashboard } from "@/components/operations/operations-dashboard";
import { DEFAULT_CURRENCY_CODE } from "@/components/ui/formatters";
import { PageHeader } from "@/components/ui/page-header";
import { SourceStatus } from "@/components/ui/source-status";
export const metadata: Metadata = { title: "Operations" };
export const dynamic = "force-dynamic";
const description = "See where execution and cash are blocked across delivery, billing, collections, and receivables.";
export default async function OperationsPage() {
  const result = await loadSafely(loadOperationsViewData, "Live Work Order intelligence is temporarily unavailable. Please retry after the server connection is restored.");
  if (!result.data) {
    return <div className="page"><PageHeader eyebrow="Work Order Intelligence" title="Operations" description={description} /><OperationsDashboard error={result.error} /></div>;
  }
  const data = result.data;
  return <div className="page"><PageHeader eyebrow="Work Order Intelligence" title="Operations" description={description} actions={<SourceStatus fetchedAt={data.snapshot.source.fetchedAt} boardNames={[data.snapshot.source.workOrdersBoardName]} recordsAnalyzed={data.snapshot.workOrders.length} dataMode={data.snapshot.source.dataMode === "temporal" ? "temporal" : "live"} freshnessState={data.snapshot.source.freshnessState} lastSyncSucceededAt={data.snapshot.source.lastSyncSucceededAt} />} /><OperationsDashboard health={data.health} sectors={data.sectors} currency={DEFAULT_CURRENCY_CODE} /></div>;
}
