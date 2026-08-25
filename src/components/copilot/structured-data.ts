import { formatAmount, formatNumber } from "@/components/ui/formatters";

const MAX_LINES = 24;
const MAX_FIELDS_PER_LINE = 6;
const MONETARY_KEY = /value|amount|receivables?|pipeline|revenue|billing|collected|cash|exposure/i;
const COUNT_LIKE_KEY = /count|records|deals$|score/i;
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

const PIPELINE_PRIMARY_KEYS = ["sector", "openPipelineValue", "wonValue", "openDeals", "wonDeals"];
const PIPELINE_COVERAGE_KEYS = [
  "knownOpenValueDeals",
  "unknownOpenValueDeals",
  "knownWonValueDeals",
  "unknownWonValueDeals",
];
const WORK_ORDER_PRIMARY_KEYS = [
  "receivables",
  "billedValueInclGst",
  "collectedAmountInclGst",
  "amountToBeBilledInclGst",
];
const WORK_ORDER_COVERAGE_KEYS = ["unknownReceivableCount"];
const RANKING_MONETARY_KEYS = [
  "wonValue",
  "openPipelineValue",
  "workOrderValueInclGst",
  "receivables",
  "combinedExposure",
  "knownDealValueRecords",
  "unknownDealValueRecords",
];
const RANKING_OPERATIONAL_KEYS = [
  "workOrderCount",
  "activeWorkOrders",
  "delayedWorkOrders",
  "pausedWorkOrders",
  "arPriorityWorkOrders",
  "executionRiskScore",
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

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function formatPrimitive(key: string, value: string | number | boolean, currencyCode?: string): string {
  if (typeof value === "number") {
    return MONETARY_KEY.test(key) && !COUNT_LIKE_KEY.test(key) && currencyCode
      ? formatAmount(value, currencyCode)
      : formatNumber(value);
  }
  return String(value);
}

function primitiveEntries(record: Record<string, unknown>): Array<[string, string | number | boolean]> {
  const entries = Object.entries(record).filter(
    (entry): entry is [string, string | number | boolean] => isPrimitive(entry[1]),
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

function appendLine(lines: string[], line: string | null): void {
  if (!line || lines.length >= MAX_LINES || lines.includes(line)) return;
  lines.push(line);
}

function fieldsLine(
  record: Record<string, unknown>,
  keys: string[],
  currencyCode?: string,
  prefix?: string,
): string | null {
  const fields = keys.flatMap((key) => {
    const value = record[key];
    return isPrimitive(value)
      ? [`${labelize(key)}: ${formatPrimitive(key, value, currencyCode)}`]
      : [];
  });
  if (!fields.length) return null;
  return `${prefix ? `${prefix} — ` : ""}${fields.join(" · ")}`;
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

function addAuthoritativeMetricLines(
  record: Record<string, unknown>,
  currencyCode: string | undefined,
  lines: string[],
): boolean {
  let added = false;
  if (PIPELINE_PRIMARY_KEYS.slice(1).some((key) => key in record)) {
    appendLine(lines, fieldsLine(record, PIPELINE_PRIMARY_KEYS, currencyCode, "Pipeline"));
    appendLine(lines, fieldsLine(record, PIPELINE_COVERAGE_KEYS, currencyCode, "Pipeline value coverage"));
    added = true;
  }
  if (WORK_ORDER_PRIMARY_KEYS.some((key) => key in record)) {
    appendLine(lines, fieldsLine(record, WORK_ORDER_PRIMARY_KEYS, currencyCode, "Work Orders / Receivables"));
    appendLine(lines, fieldsLine(record, WORK_ORDER_COVERAGE_KEYS, currencyCode, "Receivable coverage"));
    added = true;
  }
  return added;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function addRankingLines(
  record: Record<string, unknown>,
  currencyCode: string | undefined,
  lines: string[],
): boolean {
  if (!Array.isArray(record.entries)) return false;
  const rankingType = typeof record.rankingType === "string" ? record.rankingType : undefined;
  if (rankingType) appendLine(lines, `Ranking: ${labelize(rankingType)}`);

  for (const rawEntry of record.entries) {
    if (lines.length >= MAX_LINES) break;
    const entry = asRecord(rawEntry);
    if (!entry) continue;

    const rank = entry.rank;
    const client = entry.normalizedClientKey;
    const basis = entry.deterministicBasis;
    const headerParts = [
      isPrimitive(rank) ? `Rank: ${formatPrimitive("rank", rank, currencyCode)}` : null,
      typeof client === "string" ? `Client: ${client}` : null,
      typeof basis === "string" ? `Basis: ${basis}` : null,
    ].filter((part): part is string => Boolean(part));
    appendLine(lines, headerParts.length ? headerParts.join(" · ") : summarizeRecord(entry, currencyCode));

    const monetaryValues = asRecord(entry.monetaryValues);
    if (monetaryValues) {
      appendLine(lines, fieldsLine(monetaryValues, RANKING_MONETARY_KEYS, currencyCode, "Monetary values"));
    }

    const operationalValues = asRecord(entry.operationalValues);
    if (operationalValues) {
      appendLine(lines, fieldsLine(operationalValues, RANKING_OPERATIONAL_KEYS, currencyCode, "Operational values"));
    }

    const caveats = stringArray(entry.caveats);
    if (caveats.length) appendLine(lines, `Caveats — ${caveats.join(" · ")}`);
  }

  const resultCaveats = stringArray(record.caveats);
  if (resultCaveats.length) appendLine(lines, `Ranking caveats — ${resultCaveats.join(" · ")}`);
  return true;
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
        const priorityAdded = addAuthoritativeMetricLines(record, currencyCode, lines);
        if (!priorityAdded) appendLine(lines, summarizeRecord(record, currencyCode));
        for (const nested of Object.values(record)) {
          if (lines.length >= MAX_LINES) break;
          if (Array.isArray(nested) && nested.some((entry) => typeof entry === "object" && entry !== null)) {
            collectLines(nested, currencyCode, lines, depth + 1);
          }
        }
      } else if (typeof item === "string" || typeof item === "number") {
        appendLine(lines, String(item));
      }
    }
    return;
  }

  const record = asRecord(value);
  if (!record) return;

  if (addRankingLines(record, currencyCode, lines)) return;

  const priorityAdded = addAuthoritativeMetricLines(record, currencyCode, lines);
  if (!priorityAdded) appendLine(lines, summarizeRecord(record, currencyCode));

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
  return lines.slice(0, MAX_LINES);
}
