import { formatNumber } from "./formatters";

type CoverageBarProps = {
  label: string;
  known: number;
  unknown: number;
  knownLabel?: string;
  unknownLabel?: string;
  description?: string;
};

export function CoverageBar({
  label,
  known,
  unknown,
  knownLabel = "Known",
  unknownLabel = "Unknown",
  description,
}: CoverageBarProps) {
  const accessibleLabel = `${label}: ${formatNumber(known)} ${knownLabel.toLowerCase()}, ${formatNumber(unknown)} ${unknownLabel.toLowerCase()}.`;

  return (
    <figure className="coverage-visual" aria-label={accessibleLabel}>
      <div className="coverage-heading">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
      <div className="coverage-track" aria-hidden="true">
        <span className="coverage-known" style={{ flexGrow: Math.max(known, 0) }} />
        <span className="coverage-unknown" style={{ flexGrow: Math.max(unknown, 0) }} />
      </div>
      <figcaption className="coverage-legend">
        <span><i className="coverage-dot coverage-dot-known" aria-hidden="true" />{knownLabel}<strong>{formatNumber(known)}</strong></span>
        <span><i className="coverage-dot coverage-dot-unknown" aria-hidden="true" />{unknownLabel}<strong>{formatNumber(unknown)}</strong></span>
      </figcaption>
    </figure>
  );
}
