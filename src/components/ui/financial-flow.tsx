import { formatAmount, formatAmountFull } from "./formatters";

type FinancialFlowProps = {
  totalAmount: number;
  billed: number;
  collected: number;
  toBeBilled: number;
  receivables: number;
  currency?: string;
};

type MoneyNodeProps = {
  label: string;
  value: number;
  currency?: string;
  tone?: "neutral" | "positive" | "warning";
};

function MoneyNode({ label, value, currency, tone = "neutral" }: MoneyNodeProps) {
  const exact = formatAmountFull(value, currency);
  return (
    <article className={`financial-node financial-node-${tone}`} aria-label={`${label}: ${exact}`}>
      <span>{label}</span>
      <strong title={exact}>{formatAmount(value, currency)}</strong>
      <small>{exact}</small>
    </article>
  );
}

export function FinancialFlow({
  totalAmount,
  billed,
  collected,
  toBeBilled,
  receivables,
  currency,
}: FinancialFlowProps) {
  return (
    <figure className="financial-flow" aria-label="Work Order financial flow from total value through billing and collection">
      <div className="financial-main-flow">
        <MoneyNode label="Total WO value" value={totalAmount} currency={currency} />
        <span className="financial-connector" aria-hidden="true">→</span>
        <MoneyNode label="Billed incl. GST" value={billed} currency={currency} />
        <span className="financial-connector" aria-hidden="true">→</span>
        <MoneyNode label="Collected incl. GST" value={collected} currency={currency} tone="positive" />
      </div>
      <div className="financial-branches" aria-label="Outstanding financial positions">
        <MoneyNode label="To be billed incl. GST" value={toBeBilled} currency={currency} tone="warning" />
        <MoneyNode label="Receivables" value={receivables} currency={currency} tone="warning" />
      </div>
      <figcaption>All amounts are supplied by deterministic Work Order analytics; the visual does not derive financial totals.</figcaption>
    </figure>
  );
}
