import { formatAmount, formatNumber } from "@/components/ui/formatters";

const MAX_LINES = 12;
const MAX_FIELDS_PER_LINE = 6;
const MONETARY_KEY = /value|amount|receivable|pipeline|revenue|billing|collected|cash|won|exposure/i;
const PRIORITY_KEYS = [
  "rank",
  "sector",
  "stage",
  "quarter",
  "period",
  "normalizedClientKey",
  "client",
  "name",
  "title",
  "entity",
  "severity",
  "status",
  "reason",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function labelize(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatPrimitive(key: string, value: string | number | boolean, currencyCode?: string): string {
  if (typeof value === "number") {
    return MONETARY_KEY.test(key) && currencyCode
      ? formatAmount(value, currencyCode)
      : formatNumber(value);
  }
  return String(value);
}

function primitiveEntries(record: Record<string, unknown>): Array<[string, string | number | boolean]> {
  const entries = Object.entries(record).filter(
    (entry): entry is [string, string | number | boolean] => {
      const value = entry[1];
      return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
    },
  );

  return entries.sort(([left], [right]) => {
    const leftPriority = PRIORITY_KEYS.indexOf(left);
    const rightPriority = PRIORITY_KEYS.indexOf(right);
    if (leftPriority === -1 && rightPriority === -1) return 0;
    if (leftPriority === -1) return 1;
    if (rightPriority === -1) return -1;
    return leftPriority - rightPriority;
  });
}

function summarizeRecord(record: Record<string, unknown>, currencyCode?: string): string | null {
  const fields = primitiveEntries(record)
    .filter(([key]) => !/^(sourceRow|malformed)$/i.test(key))
    .slice(0, MAX_FIELDS_PER_LINE)
    .map(([key, value]) => `${labelize(key)}: ${formatPrimitive(key, value, currencyCode)}`);

  if (fields.length === 0) return null;

  const reasons = record.reasons;
  if (Array.isArray(reasons)) {
    const firstReason = reasons.find((reason): reason is string => typeof reason === "string" && reason.trim().length > 0);
    if (firstReason && fields.length < MAX_FIELDS_PER_LINE) fields.push(`Reason: ${firstReason}`);
  }

  return fields.join(" · ");
}

function collectLines(
  value: unknown,
  currencyCode: string | undefined,
  lines: string[],
  depth: number,
): void {
  if (lines.length >= MAX_LINES || depth > 3 || value === null || value === undefined) return;

  if (Array.isArray(value)) {
    for (const item of value.slice(0, MAX_LINES - lines.length)) {
      if (lines.length >= MAX_LINES) break;
      const record = asRecord(item);
      if (record) {
        const summary = summarizeRecord(record, currencyCode);
        if (summary) lines.push(summary);
        for (const nested of Object.values(record)) {
          if (lines.length >= MAX_LINES) break;
          if (Array.isArray(nested) && nested.some((entry) => typeof entry === "object" && entry !== null)) {
            collectLines(nested, currencyCode, lines, depth + 1);
          }
        }
      } else if (typeof item === "string" || typeof item === "number") {
        lines.push(String(item));
      }
    }
    return;
  }

  const record = asRecord(value);
  if (!record) return;

  const rootSummary = summarizeRecord(record, currencyCode);
  if (rootSummary) lines.push(rootSummary);

  const preferredNestedKeys = [
    "result",
    "latestAvailableResult",
    "sectors",
    "stages",
    "entries",
    "items",
    "riskyDeals",
    "clientsWithCommercialAndOperationalExposure",
    "topOpenDeals",
    "issues",
    "pipeline",
    "workOrders",
    "dataQuality",
  ];

  for (const key of preferredNestedKeys) {
    if (lines.length >= MAX_LINES) break;
    if (key in record) collectLines(record[key], currencyCode, lines, depth + 1);
  }
}

export function structuredDataLines(data: unknown, currencyCode?: string): string[] {
  const lines: string[] = [];
  collectLines(data, currencyCode, lines, 0);
  return [...new Set(lines)].slice(0, MAX_LINES);
}
