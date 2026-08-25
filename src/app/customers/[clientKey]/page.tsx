import { Customer360View } from "@/components/customers/customer-360";
import {
  loadCustomer360ViewData,
  loadSafely,
} from "@/components/data/server-dashboard-data";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default async function Customer360Page({
  params,
}: {
  params: Promise<{ clientKey: string }>;
}) {
  const { clientKey } = await params;
  const key = clientKey.trim();
  const result = await loadSafely(
    () => loadCustomer360ViewData(key),
    "Customer 360 is temporarily unavailable. Please retry after the live data connection is restored.",
  );

  if (!result.data) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Customer Intelligence"
          title={`Customer 360 · ${key || "Unknown"}`}
          description="Commercial, operations, cash, trust, history and attention joined by canonical normalized client identity."
        />
        <div className="state-card">
          <span className="state-icon state-icon-error" aria-hidden="true">!</span>
          <p className="state-title">Customer 360 unavailable</p>
          <p className="state-description">{result.error}</p>
        </div>
      </div>
    );
  }

  if (!result.data.customer) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Customer Intelligence"
          title={`Customer 360 · ${key || "Unknown"}`}
          description="Commercial, operations, cash, trust, history and attention joined by canonical normalized client identity."
        />
        <div className="state-card">
          <span className="state-icon" aria-hidden="true">?</span>
          <p className="state-title">Canonical customer not found</p>
          <p className="state-description">
            No Deal or Work Order in the latest snapshot has normalizedClientKey exactly equal to “{key}”. No fuzzy fallback was attempted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Customer Intelligence"
        title={`Customer 360 · ${result.data.customer.normalizedClientKey}`}
        description="Commercial, operations, cash, trust, history and attention joined by exact canonical normalized client identity."
      />
      <Customer360View customer={result.data.customer} />
    </div>
  );
}
