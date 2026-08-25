import type { Metadata } from "next";
import { FounderCopilot } from "@/components/copilot/founder-copilot";
import { PageHeader } from "@/components/ui/page-header";
export const metadata: Metadata = { title: "Founder Copilot" };
export default function CopilotPage() { return <div className="page page-copilot"><PageHeader eyebrow="Founder Intelligence" title="Founder Copilot" description="Ask natural-language questions and receive grounded, source-aware business answers." /><FounderCopilot /></div>; }
