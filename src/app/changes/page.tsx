import type { Metadata } from "next";
import {
  loadChangeIntelligenceViewData,
  loadSafely,
} from "@/components/data/server-dashboard-data";
import { ChangeDetective } from "@/components/change-intelligence/change-detective";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Change Detective" };
export const dynamic = "force-dynamic";

export default async function ChangeDetectivePage() {
  const result = await loadSafely(
    loadChangeIntelligenceViewData,
    "Change intelligence is temporarily unavailable. Please retry after the live data connection is restored.",
  );

  if (!result.data) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Decision Intelligence"
          title="Change Detective"
          description="What changed, why it matters, and the deterministic evidence behind each signal."
        />
        <div className="state-card">
          <span className="state-icon state-icon-error" aria-hidden="true">!</span>
          <p className="state-title">Change intelligence unavailable</p>
          <p className="state-description">{result.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Decision Intelligence"
        title="Change Detective"
        description="What changed, why it matters, and the deterministic evidence behind each signal. No predictive ML or opaque risk scores."
      />
      <ChangeDetective result={result.data.changes} />
    </div>
  );
}
