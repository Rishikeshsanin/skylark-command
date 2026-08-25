import type { Metadata } from "next";
import { FounderCopilot } from "@/components/copilot/founder-copilot";
import { CopilotTrustKey } from "@/components/copilot/copilot-trust-key";
import { PageHeader } from "@/components/ui/page-header";
export const metadata: Metadata = { title: "Founder Copilot" };
const description = "Answer-first analysis with the takeaway, key metrics, evidence, caveats, and follow-up paths.";
export default function CopilotPage() { return <div className="page page-copilot"><PageHeader eyebrow="Founder Intelligence" title="Founder Copilot" description={description} /><CopilotTrustKey /><FounderCopilot /></div>; }
