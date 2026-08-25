import { InsightBadge } from "@/components/ui/insight-badge";

const evidenceTypes = [
  { kind: "fact" as const, label: "Deterministic metric or supplied result" },
  { kind: "estimate" as const, label: "Modelled or predictive value when explicitly available" },
  { kind: "interpretation" as const, label: "Explanatory narrative grounded in the supplied facts" },
];

export function CopilotTrustKey() {
  return (
    <aside className="copilot-trust-key" aria-label="Founder Copilot evidence types">
      <div>
        <strong>Answer evidence</strong>
        <span>Facts, estimates, and interpretation remain visually distinct.</span>
      </div>
      <div className="copilot-trust-key-items">
        {evidenceTypes.map((item) => (
          <span className="copilot-trust-key-item" key={item.kind}>
            <InsightBadge kind={item.kind} />
            <small>{item.label}</small>
          </span>
        ))}
      </div>
    </aside>
  );
}
