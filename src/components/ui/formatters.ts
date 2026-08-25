export function formatNumber(value: number | null | undefined, maximumFractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(value);
}

export function formatCompactNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatAmount(value: number | null | undefined, currencyCode?: string) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const currency = currencyCode?.trim().toUpperCase();
  if (!currency) return formatCompactNumber(value);

  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return formatCompactNumber(value);
  }
}

/** Full-precision presentation for authoritative backend-supplied monetary values. */
export function formatAmountFull(value: number | null | undefined, currencyCode?: string) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const currency = currencyCode?.trim().toUpperCase();
  if (!currency) return formatNumber(value, 2);

  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return formatNumber(value, 2);
  }
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
