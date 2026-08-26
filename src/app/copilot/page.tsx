import type { Metadata } from "next";
import { FounderCopilotV2 } from "@/components/copilot/founder-copilot-v2";
import { CopilotTrustKey } from "@/components/copilot/copilot-trust-key";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Founder Copilot 2.0" };

const description =
  "Answer-first constrained analysis with deterministic tools, Scenario Lab, evidence, caveats, and follow-up paths.";

export default function CopilotPage() {
  return (
    <div className="page page-copilot">
      <PageHeader
        eyebrow="Founder Intelligence"
        title="Founder Copilot 2.0"
        description={description}
      />
      <CopilotTrustKey />
      <FounderCopilotV2 />
    </div>
  );
}
