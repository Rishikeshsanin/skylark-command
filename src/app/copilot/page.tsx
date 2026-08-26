import type { Metadata } from "next";
import { FounderCopilotV2 } from "@/components/copilot/founder-copilot-v2";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Founder Copilot 2.0" };

export default function CopilotPage() {
  return (
    <div className="page page-copilot">
      <PageHeader
        eyebrow="Founder Intelligence"
        title="Founder Copilot 2.0"
        description="Constrained analytical orchestration with structured context, deterministic tools, scenario simulation, and visible evidence."
      />
      <FounderCopilotV2 />
    </div>
  );
}
