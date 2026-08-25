import { formatAmount, formatNumber } from "@/components/ui/formatters";

const MAX_LINES = 40;
const MAX_FIELDS_PER_LINE = 8;
const MONETARY_KEY = /value|amount|receivable|pipeline|revenue|billing|collected|cash|won|exposure/i;
const PRIORITY_KEYS = [
  "rank",
  "normalizedClientKey",
  "sector",
  "stage",
  "quarter",
  "period",
  "openPipelineValue",
  "wonValue",
  "openDealCount",
  "dealCount",
  "knownValueDealCount",
  "unknownValueDealCount",
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

function numberValue(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function formatMoney(value: number, currencyCode?: string): string {
  return currencyCode ? formatAmount(value, currencyCode) : formatNumber(value);
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

function pipelineLines(record: Record<string, unknown>, currencyCode?: string): string[] {
  const openPipelineValue = numberValue(record, "openPipelineValue");
  const wonValue = numberValue(record, "wonValue");
  const openDeals = numberValue(record, "openDeals");
  const wonDeals = numberValue(record, "wonDeals");
  const knownOpen = numberValue(record, "knownOpenValueDeals");
  const unknownOpen = numberValue(record, "unknownOpenValueDeals");
  const knownWon = numberValue(record, "knownWonValueDeals");
  const unknownWon = numberValue(record, "unknownWonValueDeals");

  if (
    openPipelineValue === undefined ||
    wonValue === undefined ||
    openDeals === undefined ||
    wonDeals === undefined
  ) {
    return [];
  }

  const lines = [
    `Known open pipeline value: ${formatMoney(openPipelineValue, currencyCode)}`,
    `Open deals: ${formatNumber(openDeals)}${knownOpen !== undefined && unknownOpen !== undefined ? ` · Deal value coverage: ${formatNumber(knownOpen)} known, ${formatNumber(unknownOpen)} unknown` : ""}`,
    `Known won value: ${formatMoney(wonValue, currencyCode)}`,
    `Won deals: ${formatNumber(wonDeals)}${knownWon !== undefined && unknownWon !== undefined ? ` · Deal value coverage: ${formatNumber(knownWon)} known, ${formatNumber(unknownWon)} unknown` : ""}`,
  ];
  const averageOpenDealSize = numberValue(record, "averageOpenDealSize");
  if (averageOpenDealSize !== undefined) {
    lines.push(`Known-value average open deal size: ${formatMoney(averageOpenDealSize, currencyCode)}`);
  }
  return lines;
}

function receivablesLines(record: Record<string, unknown>, currencyCode?: string): string[] {
  const receivables = numberValue(record, "receivables");
  const billed = numberValue(record, "billedValueInclGst");
  const collected = numberValue(record, "collectedAmountInclGst");
  const toBeBilled = numberValue(record, "amountToBeBilledInclGst");
  const unknownReceivableCount = numberValue(record, "unknownReceivableCount");
  if (
    receivables === undefined ||
    billed === undefined ||
    collected === undefined ||
    toBeBilled === undefined
  ) {
    return [];
  }

  return [
    `Known receivables: ${formatMoney(receivables, currencyCode)}${unknownReceivableCount !== undefined ? ` · Unknown receivable records: ${formatNumber(unknownReceivableCount)}` : ""}`,
    `Known billing incl GST: ${formatMoney(billed, currencyCode)}`,
    `Known collections incl GST: ${formatMoney(collected, currencyCode)}`,
    `Known amount to be billed incl GST: ${formatMoney(toBeBilled, currencyCode)}`,
  ];
}

function rankingLines(record: Record<string, unknown>, currencyCode?: string): string[] {
  const rankingType = stringValue(record, "rankingType");
  const entries = record.entries;
  if (!rankingType || !Array.isArray(entries)) return [];

  const lines: string[] = [`Customer ranking: ${rankingType.replace(/_/g, " ")}`];
  for (const item of entries.slice(0, 5)) {
    if (lines.length >= MAX_LINES) break;
    const entry = asRecord(item);
    if (!entry) continue;
    const rank = numberValue(entry, "rank");
    const clientKey = stringValue(entry, "normalizedClientKey");
    const basis = stringValue(entry, "deterministicBasis");
    if (rank !== undefined && clientKey) {
      lines.push(`Rank ${formatNumber(rank)} · Client ${clientKey}${basis ? ` · Basis: ${basis}` : ""}`);
    }

    const monetary = asRecord(entry.monetaryValues);
    if (monetary) {
      const wonValue = numberValue(monetary, "wonValue");
      const openPipelineValue = numberValue(monetary, "openPipelineValue");
      const workOrderValueInclGst = numberValue(monetary, "workOrderValueInclGst");
      const receivables = numberValue(monetary, "receivables");
      const combinedExposure = numberValue(monetary, "combinedExposure");
      if (
        wonValue !== undefined &&
        openPipelineValue !== undefined &&
        workOrderValueInclGst !== undefined &&
        receivables !== undefined &&
        combinedExposure !== undefined
      ) {
        lines.push(
          `Monetary values — Known won value: ${formatMoney(wonValue, currencyCode)} · Known open pipeline value: ${formatMoney(openPipelineValue, currencyCode)} · Work Order value incl GST: ${formatMoney(workOrderValueInclGst, currencyCode)} · Known receivables: ${formatMoney(receivables, currencyCode)} · Combined exposure: ${formatMoney(combinedExposure, currencyCode)}`,
        );
      }
      const knownDealValueRecords = numberValue(monetary, "knownDealValueRecords");
      const unknownDealValueRecords = numberValue(monetary, "unknownDealValueRecords");
      if (knownDealValueRecords !== undefined && unknownDealValueRecords !== undefined) {
        lines.push(
          `Deal value coverage — Known records: ${formatNumber(knownDealValueRecords)} · Unknown records: ${formatNumber(unknownDealValueRecords)}`,
        );
      }
    }

    const operational = asRecord(entry.operationalValues);
    if (operational) {
      const active = numberValue(operational, "activeWorkOrders");
      const delayed = numberValue(operational, "delayedWorkOrders");
      const paused = numberValue(operational, "pausedWorkOrders");
      const executionRiskScore = numberValue(operational, "executionRiskScore");
      if (
        active !== undefined &&
        delayed !== undefined &&
        paused !== undefined &&
        executionRiskScore !== undefined
      ) {
        lines.push(
          `Operational values — Active Work Orders: ${formatNumber(active)} · Delayed: ${formatNumber(delayed)} · Paused: ${formatNumber(paused)} · Execution risk score: ${formatNumber(executionRiskScore)}`,
        );
      }
    }

    if (Array.isArray(entry.caveats)) {
      for (const caveat of entry.caveats) {
        if (lines.length >= MAX_LINES) break;
        if (typeof caveat === "string" && caveat.trim()) lines.push(`Caveat — ${caveat.trim()}`);
      }
    }
  }
  if (Array.isArray(record.caveats)) {
    for (const caveat of record.caveats) {
      if (lines.length >= MAX_LINES) break;
      if (typeof caveat === "string" && caveat.trim()) lines.push(`Ranking caveat — ${caveat.trim()}`);
    }
  }
  return lines;
}

function crossBoardLines(record: Record<string, unknown>, currencyCode?: string): string[] {
  const total = numberValue(record, "totalUniqueWorkOrderClientKeys");
  const matched = numberValue(record, "matchedUniqueWorkOrderClientKeys");
  const unmatched = numberValue(record, "unmatchedUniqueWorkOrderClientKeys");
  if (total === undefined || matched === undefined || unmatched === undefined) return [];

  const lines = [
    `Unique Work Order client keys: ${formatNumber(total)}`,
    `Matched unique Work Order client keys: ${formatNumber(matched)}`,
    `Unmatched unique Work Order client keys: ${formatNumber(unmatched)}`,
  ];
  if (Array.isArray(record.unmatchedWorkOrderClientKeys) && record.unmatchedWorkOrderClientKeys.length > 0) {
    const keys = record.unmatchedWorkOrderClientKeys.filter((key): key is string => typeof key === "string");
    if (keys.length > 0) lines.push(`Unmatched client keys: ${keys.join(", ")}`);
  }
  if (Array.isArray(record.matchedClients)) {
    for (const client of record.matchedClients.slice(0, 8)) {
      if (lines.length >= MAX_LINES) break;
      const clientRecord = asRecord(client);
      if (!clientRecord) continue;
      const summary = summarizeRecord(clientRecord, currencyCode);
      if (summary) lines.push(summary);
    }
  }
  return lines;
}

function specializedLines(record: Record<string, unknown>, currencyCode?: string): string[] {
  const ranking = rankingLines(record, currencyCode);
  if (ranking.length) return ranking;
  const crossBoard = crossBoardLines(record, currencyCode);
  if (crossBoard.length) return crossBoard;
  const pipeline = pipelineLines(record, currencyCode);
  if (pipeline.length) return pipeline;
  const receivables = receivablesLines(record, currencyCode);
  if (receivables.length) return receivables;
  return [];
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

  const specialized = specializedLines(record, currencyCode);
  if (specialized.length > 0) {
    lines.push(...specialized.slice(0, MAX_LINES - lines.length));
    return;
  }

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
    "matchedClients",
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
