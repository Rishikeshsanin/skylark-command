import type { CSSProperties } from "react";
import {
  formatAmount,
  formatAmountFull,
  formatNumber,
} from "@/components/ui/formatters";

type ValueFormat = "currency" | "number" | "text";
type CellValue = string | number | boolean | null | undefined;

export type VisualMetric = {
  id: string;
  label: string;
  value: CellValue;
  format: ValueFormat;
  hint?: string;
  tone?: "neutral" | "warning" | "critical" | "positive";
};

export type VisualBarRow = {
  id: string;
  label: string;
  rank?: string | number;
  value: number | undefined;
  secondary: string[];
};

export type VisualChart = {
  id: string;
  title: string;
  valueLabel: string;
  ariaLabel: string;
  valueFormat: ValueFormat;
  rows: VisualBarRow[];
};

export type VisualTableColumn = {
  id: string;
  label: string;
  format: ValueFormat;
};

export type VisualTableRow = {
  id: string;
  cells: Record<string, CellValue>;
};

export type VisualTable = {
  id: string;
  ariaLabel: string;
  columns: VisualTableColumn[];
  rows: VisualTableRow[];
  initialVisibleRows?: number;
  remainingLabel?: string;
};

export type VisualAnalyticsSection = {
  id: string;
  title: string;
  description?: string;
  currencyCode?: string;
  metrics: VisualMetric[];
  chart?: VisualChart;
  additionalCharts?: VisualChart[];
  table?: VisualTable;
  notice?: {
    title: string;
    message: string;
  };
};

const PRIMARY_VISUAL_ROWS = 8;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = asRecord(item);
    return record ? [record] : [];
  });
}

function readString(record: Record<string, unknown> | null, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNumber(record: Record<string, unknown> | null, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(record: Record<string, unknown> | null, key: string): boolean | undefined {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function hasOwn(record: Record<string, unknown> | null, key: string): boolean {
  return Boolean(record && Object.prototype.hasOwnProperty.call(record, key));
}

function nestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return asRecord(record[key]);
}

function nestedNumber(record: Record<string, unknown>, parent: string, key: string): number | undefined {
  return readNumber(nestedRecord(record, parent), key);
}

function nestedHasOwn(record: Record<string, unknown>, parent: string, key: string): boolean {
  return hasOwn(nestedRecord(record, parent), key);
}

function suppliedMetric(
  id: string,
  label: string,
  value: CellValue,
  format: ValueFormat,
  hint?: string,
  tone?: VisualMetric["tone"],
): VisualMetric | null {
  if (value === undefined || value === null) return null;
  return { id, label, value, format, hint, tone };
}

function compactSuppliedMetrics(metrics: Array<VisualMetric | null>): VisualMetric[] {
  return metrics.filter((metric): metric is VisualMetric => metric !== null);
}

function unknownAwarePair(
  left: number | undefined,
  right: number | undefined,
  separator = " / ",
): string | undefined {
  if (left === undefined && right === undefined) return undefined;
  return `${left === undefined ? "Unknown" : formatNumber(left)}${separator}${right === undefined ? "Unknown" : formatNumber(right)}`;
}

function clientColumns(
  clients: Record<string, unknown>[],
  nested: boolean,
  includeRank: boolean,
): VisualTableColumn[] {
  const monetaryFieldExists = (key: string) =>
    clients.some((client) => nested ? nestedHasOwn(client, "monetaryValues", key) : hasOwn(client, key));
  const operationalFieldExists = (key: string) =>
    clients.some((client) => nested ? nestedHasOwn(client, "operationalValues", key) : hasOwn(client, key));

  const columns: VisualTableColumn[] = [];
  if (includeRank) columns.push({ id: "rank", label: "Rank", format: "number" });
  columns.push({ id: "client", label: "Client", format: "text" });
  if (monetaryFieldExists(nested ? "openPipelineValue" : "openDealValue")) {
    columns.push({ id: "openPipeline", label: "Open pipeline", format: "currency" });
  }
  if (monetaryFieldExists("wonValue")) {
    columns.push({ id: "wonValue", label: "Won value", format: "currency" });
  }
  if (monetaryFieldExists("workOrderValueInclGst")) {
    columns.push({ id: "workOrderValue", label: "Work Order value", format: "currency" });
  }
  if (monetaryFieldExists("receivables")) {
    columns.push({ id: "receivables", label: "Receivables", format: "currency" });
  }
  if (nested && monetaryFieldExists("combinedExposure")) {
    columns.push({ id: "combinedExposure", label: "Combined exposure", format: "currency" });
  }
  if (nested
    ? operationalFieldExists("workOrderCount") || operationalFieldExists("activeWorkOrders")
    : operationalFieldExists("workOrderCount") || operationalFieldExists("activeWorkOrderCount")) {
    columns.push({ id: "workOrders", label: "Active / total WOs", format: "text" });
  }
  if (!nested && clients.some((client) => hasOwn(client, "openDealCount") || hasOwn(client, "dealCount"))) {
    columns.push({ id: "deals", label: "Open / total deals", format: "text" });
  }
  if (nested && operationalFieldExists("executionRiskScore")) {
    columns.push({ id: "executionRisk", label: "Execution risk score", format: "number" });
  }
  if (nested && clients.some((client) =>
    nestedHasOwn(client, "monetaryValues", "knownDealValueRecords") ||
    nestedHasOwn(client, "monetaryValues", "unknownDealValueRecords"))) {
    columns.push({ id: "coverage", label: "Known / unknown values", format: "text" });
  }
  if (!nested && clients.some((client) => Array.isArray(client.sectors))) {
    columns.push({ id: "sectors", label: "Sectors", format: "text" });
  }
  return columns;
}

function rankingSection(
  record: Record<string, unknown>,
  fallbackCurrencyCode?: string,
): VisualAnalyticsSection | null {
  const rankingType = readString(record, "rankingType");
  const entries = recordArray(record.entries);
  if (!rankingType || !Array.isArray(record.entries)) return null;

  const currencyCode = readString(record, "currencyCode") ?? fallbackCurrencyCode;
  const provenance = asRecord(record.provenance);
  const definitions: Record<string, {
    title: string;
    chartTitle: string;
    valueLabel: string;
    valueFormat: ValueFormat;
    value: (entry: Record<string, unknown>) => number | undefined;
  }> = {
    won_value: {
      title: "Customer won-value ranking",
      chartTitle: "Customer comparison",
      valueLabel: "Known won value",
      valueFormat: "currency",
      value: (entry) => nestedNumber(entry, "monetaryValues", "wonValue"),
    },
    open_pipeline: {
      title: "Customer active-pipeline ranking",
      chartTitle: "Customer comparison",
      valueLabel: "Known open pipeline",
      valueFormat: "currency",
      value: (entry) => nestedNumber(entry, "monetaryValues", "openPipelineValue"),
    },
    work_order_execution_health: {
      title: "Customer execution-health ranking",
      chartTitle: "Execution-health comparison",
      valueLabel: "Execution risk score",
      valueFormat: "number",
      value: (entry) => nestedNumber(entry, "operationalValues", "executionRiskScore"),
    },
    combined_importance: {
      title: "Combined customer importance",
      chartTitle: "Customer comparison",
      valueLabel: "Combined exposure indicator",
      valueFormat: "currency",
      value: (entry) => nestedNumber(entry, "monetaryValues", "combinedExposure"),
    },
  };
  const definition = definitions[rankingType];
  if (!definition) return null;

  const chartRows = entries.slice(0, PRIMARY_VISUAL_ROWS).map((entry, index) => {
    const monetary = nestedRecord(entry, "monetaryValues");
    const operational = nestedRecord(entry, "operationalValues");
    const knownValues = readNumber(monetary, "knownDealValueRecords");
    const unknownValues = readNumber(monetary, "unknownDealValueRecords");
    const activeWorkOrders = readNumber(operational, "activeWorkOrders");
    const totalWorkOrders = readNumber(operational, "workOrderCount");
    const delayedWorkOrders = readNumber(operational, "delayedWorkOrders");
    const pausedWorkOrders = readNumber(operational, "pausedWorkOrders");
    const secondary: string[] = [];

    if (rankingType === "work_order_execution_health") {
      if (activeWorkOrders !== undefined) secondary.push(`${formatNumber(activeWorkOrders)} active WOs`);
      if (delayedWorkOrders !== undefined) secondary.push(`${formatNumber(delayedWorkOrders)} delayed`);
      if (pausedWorkOrders !== undefined) secondary.push(`${formatNumber(pausedWorkOrders)} paused`);
    } else {
      if (knownValues !== undefined || unknownValues !== undefined) {
        secondary.push(`Value coverage: ${knownValues === undefined ? "Unknown" : formatNumber(knownValues)} known · ${unknownValues === undefined ? "Unknown" : formatNumber(unknownValues)} unknown`);
      }
      if (activeWorkOrders !== undefined || totalWorkOrders !== undefined) {
        secondary.push(`Active WOs: ${unknownAwarePair(activeWorkOrders, totalWorkOrders)}`);
      }
    }

    return {
      id: `${readString(entry, "normalizedClientKey") ?? "client"}-${index}`,
      label: readString(entry, "normalizedClientKey") ?? "Unknown client",
      rank: readNumber(entry, "rank") ?? "Unknown",
      value: definition.value(entry),
      secondary,
    };
  });

  const columns = clientColumns(entries, true, true);
  const tableRows = entries.map((entry, index) => {
    const monetary = nestedRecord(entry, "monetaryValues");
    const operational = nestedRecord(entry, "operationalValues");
    return {
      id: `${readString(entry, "normalizedClientKey") ?? "client"}-table-${index}`,
      cells: {
        rank: readNumber(entry, "rank"),
        client: readString(entry, "normalizedClientKey"),
        openPipeline: readNumber(monetary, "openPipelineValue"),
        wonValue: readNumber(monetary, "wonValue"),
        workOrderValue: readNumber(monetary, "workOrderValueInclGst"),
        receivables: readNumber(monetary, "receivables"),
        combinedExposure: readNumber(monetary, "combinedExposure"),
        workOrders: unknownAwarePair(
          readNumber(operational, "activeWorkOrders"),
          readNumber(operational, "workOrderCount"),
        ),
        executionRisk: readNumber(operational, "executionRiskScore"),
        coverage: unknownAwarePair(
          readNumber(monetary, "knownDealValueRecords"),
          readNumber(monetary, "unknownDealValueRecords"),
        ),
      },
    };
  });

  const metrics = compactSuppliedMetrics([
    suppliedMetric("records", "Records analyzed", readNumber(provenance, "totalRecordsAnalyzed"), "number"),
    suppliedMetric("deal-records", "Deal records", readNumber(provenance, "dealRecordsAnalyzed"), "number"),
    suppliedMetric("wo-records", "Work Order records", readNumber(provenance, "workOrderRecordsAnalyzed"), "number"),
    suppliedMetric("unmatched-deals", "Unmatched deals excluded", readNumber(record, "unmatchedDealRecordsExcluded"), "number"),
    suppliedMetric("unmatched-wos", "Unmatched WOs excluded", readNumber(record, "unmatchedWorkOrderRecordsExcluded"), "number"),
  ]);

  return {
    id: `customer-ranking-${rankingType}`,
    title: definition.title,
    description: "Order and rank come directly from the deterministic response. Bar width is display-only.",
    currencyCode,
    metrics,
    chart: {
      id: `customer-ranking-chart-${rankingType}`,
      title: definition.chartTitle,
      valueLabel: definition.valueLabel,
      valueFormat: definition.valueFormat,
      ariaLabel: `${definition.title} chart using supplied ${definition.valueLabel.toLowerCase()} values`,
      rows: chartRows,
    },
    table: {
      id: `customer-ranking-table-${rankingType}`,
      ariaLabel: `${definition.title} exact supplied values`,
      columns,
      rows: tableRows,
      initialVisibleRows: PRIMARY_VISUAL_ROWS,
      remainingLabel: "customers",
    },
  };
}

function clientTableSection(
  clients: Record<string, unknown>[],
  fallbackCurrencyCode?: string,
  summary?: Record<string, unknown>,
): VisualAnalyticsSection | null {
  if (clients.length === 0 && !summary) return null;
  const columns = clientColumns(clients, false, false);
  const rows = clients.map((client, index) => ({
    id: `${readString(client, "normalizedClientKey") ?? "client"}-${index}`,
    cells: {
      client: readString(client, "normalizedClientKey"),
      openPipeline: readNumber(client, "openDealValue"),
      wonValue: readNumber(client, "wonValue"),
      workOrderValue: readNumber(client, "workOrderValueInclGst"),
      receivables: readNumber(client, "receivables"),
      workOrders: unknownAwarePair(
        readNumber(client, "activeWorkOrderCount"),
        readNumber(client, "workOrderCount"),
      ),
      deals: unknownAwarePair(
        readNumber(client, "openDealCount"),
        readNumber(client, "dealCount"),
      ),
      sectors: Array.isArray(client.sectors)
        ? client.sectors.filter((sector): sector is string => typeof sector === "string").join(", ") || undefined
        : undefined,
    },
  }));
  const unmatchedKeys = summary && Array.isArray(summary.unmatchedWorkOrderClientKeys)
    ? summary.unmatchedWorkOrderClientKeys.filter((key): key is string => typeof key === "string")
    : [];

  return {
    id: summary ? "cross-board-client-intelligence" : "client-intelligence",
    title: summary ? "Cross-board client intelligence" : "Client intelligence",
    description: unmatchedKeys.length > 0
      ? `Unmatched Work Order client keys: ${unmatchedKeys.join(", ")}. Client order follows the deterministic response; no UI-side ranking is applied.`
      : "Client order follows the deterministic response; no UI-side ranking is applied.",
    currencyCode: readString(summary ?? null, "currencyCode") ?? fallbackCurrencyCode,
    metrics: summary ? compactSuppliedMetrics([
      suppliedMetric("unique-client-keys", "Unique Work Order clients", readNumber(summary, "totalUniqueWorkOrderClientKeys"), "number"),
      suppliedMetric("matched-client-keys", "Matched clients", readNumber(summary, "matchedUniqueWorkOrderClientKeys"), "number", undefined, "positive"),
      suppliedMetric("unmatched-client-keys", "Unmatched clients", readNumber(summary, "unmatchedUniqueWorkOrderClientKeys"), "number", undefined, "warning"),
    ]) : [],
    table: clients.length > 0 ? {
      id: summary ? "cross-board-client-table" : "client-intelligence-table",
      ariaLabel: summary ? "Cross-board client intelligence supplied values" : "Client intelligence supplied values",
      columns,
      rows,
      initialVisibleRows: PRIMARY_VISUAL_ROWS,
      remainingLabel: "clients",
    } : undefined,
  };
}

function sectorSection(
  sectors: Record<string, unknown>[],
  currencyCode?: string,
  period?: string,
): VisualAnalyticsSection | null {
  if (sectors.length === 0 || !sectors.some((sector) => hasOwn(sector, "sector"))) return null;
  const hasOpenPipeline = sectors.some((sector) => hasOwn(sector, "openPipelineValue"));
  const columns: VisualTableColumn[] = [{ id: "sector", label: "Sector", format: "text" }];
  const optionalColumns: Array<[string, string, ValueFormat, string]> = [
    ["openPipeline", "Open pipeline", "currency", "openPipelineValue"],
    ["openDeals", "Open deals", "number", "openDealCount"],
    ["deals", "Deals", "number", "dealCount"],
    ["wonValue", "Won value", "currency", "wonValue"],
    ["workOrderValue", "Work Order value", "currency", "workOrderValueInclGst"],
    ["receivables", "Receivables", "currency", "receivables"],
    ["workOrders", "Work Orders", "number", "workOrderCount"],
    ["knownValues", "Known-value deals", "number", "knownValueDealCount"],
    ["unknownValues", "Unknown-value deals", "number", "unknownValueDealCount"],
  ];
  for (const [id, label, format, sourceKey] of optionalColumns) {
    if (sectors.some((sector) => hasOwn(sector, sourceKey))) columns.push({ id, label, format });
  }
  if (sectors.some((sector) => hasOwn(sector, "activeWorkOrderCount"))) {
    columns.push({ id: "activeWorkOrders", label: "Active WOs", format: "number" });
  }

  const tableRows = sectors.map((sector, index) => ({
    id: `${readString(sector, "sector") ?? "sector"}-${index}`,
    cells: {
      sector: readString(sector, "sector"),
      openPipeline: readNumber(sector, "openPipelineValue"),
      openDeals: readNumber(sector, "openDealCount"),
      deals: readNumber(sector, "dealCount"),
      wonValue: readNumber(sector, "wonValue"),
      workOrderValue: readNumber(sector, "workOrderValueInclGst"),
      receivables: readNumber(sector, "receivables"),
      workOrders: readNumber(sector, "workOrderCount"),
      activeWorkOrders: readNumber(sector, "activeWorkOrderCount"),
      knownValues: readNumber(sector, "knownValueDealCount"),
      unknownValues: readNumber(sector, "unknownValueDealCount"),
    },
  }));

  return {
    id: period ? `sector-${period}` : "sector-comparison",
    title: period ? `Sector performance · ${period}` : "Sector open-pipeline comparison",
    description: "Rows retain the deterministic response order. Bars compare the supplied openPipelineValue only.",
    currencyCode,
    metrics: [],
    chart: hasOpenPipeline ? {
      id: period ? `sector-chart-${period}` : "sector-open-pipeline-chart",
      title: "Sector comparison",
      valueLabel: "Known open pipeline",
      valueFormat: "currency",
      ariaLabel: `${period ? `${period} ` : ""}sector chart using supplied open pipeline values`,
      rows: sectors.slice(0, PRIMARY_VISUAL_ROWS).map((sector, index) => {
        const secondary: string[] = [];
        const openDeals = readNumber(sector, "openDealCount");
        const dealCount = readNumber(sector, "dealCount");
        const known = readNumber(sector, "knownValueDealCount");
        const unknown = readNumber(sector, "unknownValueDealCount");
        if (openDeals !== undefined) secondary.push(`${formatNumber(openDeals)} open deals`);
        else if (dealCount !== undefined) secondary.push(`${formatNumber(dealCount)} deals`);
        if (known !== undefined || unknown !== undefined) {
          secondary.push(`${known === undefined ? "Unknown" : formatNumber(known)} known · ${unknown === undefined ? "Unknown" : formatNumber(unknown)} unknown values`);
        }
        return {
          id: `${readString(sector, "sector") ?? "sector"}-bar-${index}`,
          label: readString(sector, "sector") ?? "Unknown sector",
          rank: readNumber(sector, "rank"),
          value: readNumber(sector, "openPipelineValue"),
          secondary,
        };
      }),
    } : undefined,
    table: {
      id: period ? `sector-table-${period}` : "sector-comparison-table",
      ariaLabel: `${period ? `${period} ` : ""}sector exact supplied values`,
      columns,
      rows: tableRows,
      initialVisibleRows: PRIMARY_VISUAL_ROWS,
      remainingLabel: "sectors",
    },
  };
}

function stageSection(stages: Record<string, unknown>[], currencyCode?: string): VisualAnalyticsSection | null {
  if (stages.length === 0 || !stages.some((stage) => hasOwn(stage, "stage"))) return null;
  const hasValue = stages.some((stage) => hasOwn(stage, "totalValue"));
  return {
    id: "stage-distribution",
    title: "Pipeline stage distribution",
    description: "Stage order and values are supplied by deterministic analytics.",
    currencyCode,
    metrics: [],
    chart: {
      id: "stage-distribution-chart",
      title: "Stage comparison",
      valueLabel: hasValue ? "Known pipeline value" : "Deal count",
      valueFormat: hasValue ? "currency" : "number",
      ariaLabel: `Pipeline stage chart using supplied ${hasValue ? "total values" : "deal counts"}`,
      rows: stages.slice(0, PRIMARY_VISUAL_ROWS).map((stage, index) => {
        const known = readNumber(stage, "knownValueDealCount");
        const unknown = readNumber(stage, "unknownValueDealCount");
        const dealCount = readNumber(stage, "dealCount");
        const secondary: string[] = [];
        if (dealCount !== undefined) secondary.push(`${formatNumber(dealCount)} deals`);
        if (known !== undefined || unknown !== undefined) {
          secondary.push(`${known === undefined ? "Unknown" : formatNumber(known)} known · ${unknown === undefined ? "Unknown" : formatNumber(unknown)} unknown values`);
        }
        return {
          id: `${readString(stage, "stage") ?? "stage"}-${index}`,
          label: readString(stage, "stage") ?? "Unknown stage",
          value: hasValue ? readNumber(stage, "totalValue") : dealCount,
          secondary,
        };
      }),
    },
    table: {
      id: "stage-distribution-table",
      ariaLabel: "Pipeline stage exact supplied values",
      columns: [
        { id: "stage", label: "Stage", format: "text" },
        ...(hasValue ? [{ id: "value", label: "Pipeline value", format: "currency" as const }] : []),
        { id: "deals", label: "Deals", format: "number" },
        ...(stages.some((stage) => hasOwn(stage, "knownValueDealCount"))
          ? [{ id: "known", label: "Known-value deals", format: "number" as const }]
          : []),
        ...(stages.some((stage) => hasOwn(stage, "unknownValueDealCount"))
          ? [{ id: "unknown", label: "Unknown-value deals", format: "number" as const }]
          : []),
      ],
      rows: stages.map((stage, index) => ({
        id: `${readString(stage, "stage") ?? "stage"}-table-${index}`,
        cells: {
          stage: readString(stage, "stage"),
          value: readNumber(stage, "totalValue"),
          deals: readNumber(stage, "dealCount"),
          known: readNumber(stage, "knownValueDealCount"),
          unknown: readNumber(stage, "unknownValueDealCount"),
        },
      })),
      initialVisibleRows: PRIMARY_VISUAL_ROWS,
      remainingLabel: "stages",
    },
  };
}

function quarterSection(quarters: Record<string, unknown>[], currencyCode?: string): VisualAnalyticsSection | null {
  if (quarters.length === 0 || !quarters.some((quarter) => hasOwn(quarter, "quarter"))) return null;
  const hasValue = quarters.some((quarter) => hasOwn(quarter, "totalValue"));
  return {
    id: "quarter-performance",
    title: "Period performance",
    description: "Only supplied periods are shown; missing periods are not converted to zero performance.",
    currencyCode,
    metrics: [],
    chart: {
      id: "quarter-performance-chart",
      title: "Quarter comparison",
      valueLabel: hasValue ? "Known deal value" : "Deal count",
      valueFormat: hasValue ? "currency" : "number",
      ariaLabel: `Quarter chart using supplied ${hasValue ? "total values" : "deal counts"}`,
      rows: quarters.slice(0, PRIMARY_VISUAL_ROWS).map((quarter, index) => ({
        id: `${readString(quarter, "quarter") ?? "quarter"}-${index}`,
        label: readString(quarter, "quarter") ?? "Unknown period",
        value: hasValue ? readNumber(quarter, "totalValue") : readNumber(quarter, "dealCount"),
        secondary: [
          ...(readNumber(quarter, "dealCount") !== undefined
            ? [`${formatNumber(readNumber(quarter, "dealCount"))} deals`]
            : []),
          ...(readNumber(quarter, "knownValueDealCount") !== undefined
            ? [`${formatNumber(readNumber(quarter, "knownValueDealCount"))} known-value deals`]
            : []),
        ],
      })),
    },
    table: {
      id: "quarter-performance-table",
      ariaLabel: "Quarter exact supplied values",
      columns: [
        { id: "quarter", label: "Quarter", format: "text" },
        ...(hasValue ? [{ id: "value", label: "Known deal value", format: "currency" as const }] : []),
        { id: "deals", label: "Deals", format: "number" },
        ...(quarters.some((quarter) => hasOwn(quarter, "knownValueDealCount"))
          ? [{ id: "known", label: "Known-value deals", format: "number" as const }]
          : []),
      ],
      rows: quarters.map((quarter, index) => ({
        id: `${readString(quarter, "quarter") ?? "quarter"}-table-${index}`,
        cells: {
          quarter: readString(quarter, "quarter"),
          value: readNumber(quarter, "totalValue"),
          deals: readNumber(quarter, "dealCount"),
          known: readNumber(quarter, "knownValueDealCount"),
        },
      })),
      initialVisibleRows: PRIMARY_VISUAL_ROWS,
      remainingLabel: "periods",
    },
  };
}

function distributionChart(
  record: Record<string, unknown>,
  key: string,
  id: string,
  title: string,
): VisualChart | null {
  const distribution = asRecord(record[key]);
  if (!distribution) return null;
  const rows = Object.entries(distribution).flatMap(([label, value], index) =>
    typeof value === "number" && Number.isFinite(value)
      ? [{ id: `${id}-${label}-${index}`, label, value, secondary: [] }]
      : [],
  );
  if (rows.length === 0) return null;
  return {
    id,
    title,
    valueLabel: "Work Orders",
    valueFormat: "number",
    ariaLabel: `${title} chart using supplied Work Order counts`,
    rows,
  };
}

function operationsSection(
  record: Record<string, unknown>,
  currencyCode?: string,
  title = "Work Order operations",
): VisualAnalyticsSection | null {
  const looksLikeOperations = [
    "totalWorkOrders",
    "activeWorkOrders",
    "receivables",
    "executionStatusDistribution",
  ].some((key) => hasOwn(record, key));
  if (!looksLikeOperations) return null;
  const unknownReceivables = readNumber(record, "unknownReceivableCount");
  const unknownAmounts = readNumber(record, "unknownAmountCount");
  const primaryChart = distributionChart(
    record,
    "executionStatusDistribution",
    "execution-status-chart",
    "Execution status distribution",
  );
  const additionalCharts = [
    distributionChart(record, "invoiceStatusDistribution", "invoice-status-chart", "Invoice status distribution"),
    distributionChart(record, "billingStatusDistribution", "billing-status-chart", "Billing status distribution"),
  ].filter((chart): chart is VisualChart => chart !== null);

  return {
    id: "work-order-operations",
    title,
    description: "Cards and status bars map only fields supplied by deterministic Work Order analytics.",
    currencyCode,
    metrics: compactSuppliedMetrics([
      suppliedMetric("receivables", "Known receivables", readNumber(record, "receivables"), "currency", unknownReceivables !== undefined ? `${formatNumber(unknownReceivables)} records unknown` : undefined, "warning"),
      suppliedMetric("billed", "Known billed incl GST", readNumber(record, "billedValueInclGst"), "currency"),
      suppliedMetric("collected", "Known collected incl GST", readNumber(record, "collectedAmountInclGst"), "currency"),
      suppliedMetric("to-be-billed", "Known to be billed incl GST", readNumber(record, "amountToBeBilledInclGst"), "currency", unknownAmounts !== undefined ? `${formatNumber(unknownAmounts)} Work Order amounts unknown` : undefined),
      suppliedMetric("active-wos", "Active WOs", readNumber(record, "activeWorkOrders"), "number"),
      suppliedMetric("delayed-wos", "Delayed", readNumber(record, "delayedWorkOrders"), "number", undefined, "critical"),
      suppliedMetric("paused-wos", "Paused", readNumber(record, "pausedWorkOrders"), "number", undefined, "warning"),
      suppliedMetric("ar-priority", "AR priority", readNumber(record, "arPriorityWorkOrders"), "number", undefined, "warning"),
    ]),
    chart: primaryChart ?? undefined,
    additionalCharts,
  };
}

function pipelineSection(
  record: Record<string, unknown>,
  currencyCode?: string,
  title = "Pipeline snapshot",
): VisualAnalyticsSection | null {
  if (!["openPipelineValue", "wonValue", "openDeals", "wonDeals"].some((key) => hasOwn(record, key))) {
    return null;
  }
  const knownOpen = readNumber(record, "knownOpenValueDeals");
  const unknownOpen = readNumber(record, "unknownOpenValueDeals");
  const knownWon = readNumber(record, "knownWonValueDeals");
  const unknownWon = readNumber(record, "unknownWonValueDeals");
  return {
    id: `pipeline-${title}`,
    title,
    description: "Known monetary totals and value coverage remain explicit; missing values are not treated as zero.",
    currencyCode,
    metrics: compactSuppliedMetrics([
      suppliedMetric("open-pipeline", "Known open pipeline", readNumber(record, "openPipelineValue"), "currency", knownOpen !== undefined || unknownOpen !== undefined ? `${knownOpen === undefined ? "Unknown" : formatNumber(knownOpen)} known · ${unknownOpen === undefined ? "Unknown" : formatNumber(unknownOpen)} unknown values` : undefined),
      suppliedMetric("won-value", "Known won value", readNumber(record, "wonValue"), "currency", knownWon !== undefined || unknownWon !== undefined ? `${knownWon === undefined ? "Unknown" : formatNumber(knownWon)} known · ${unknownWon === undefined ? "Unknown" : formatNumber(unknownWon)} unknown values` : undefined),
      suppliedMetric("open-deals", "Open deals", readNumber(record, "openDeals"), "number"),
      suppliedMetric("won-deals", "Won deals", readNumber(record, "wonDeals"), "number"),
      suppliedMetric("average-open-deal", "Known-value average deal", readNumber(record, "averageOpenDealSize"), "currency"),
    ]),
  };
}

function dataHealthSection(record: Record<string, unknown>): VisualAnalyticsSection | null {
  const issueCounts = asRecord(record.issueCounts);
  const issues = recordArray(record.issues);
  const looksLikeDataHealth = Boolean(issueCounts) || [
    "malformedDeals",
    "malformedWorkOrders",
    "unmappedWorkOrderClients",
  ].some((key) => hasOwn(record, key));
  if (!looksLikeDataHealth) return null;
  const columns: VisualTableColumn[] = [
    { id: "severity", label: "Severity", format: "text" },
    { id: "entity", label: "Entity", format: "text" },
    { id: "field", label: "Field", format: "text" },
    { id: "issue", label: "Issue", format: "text" },
  ];
  return {
    id: "data-health",
    title: "Data health",
    description: "Issue counts and records are kept as concise evidence, without converting warnings into a score or chart.",
    metrics: compactSuppliedMetrics([
      suppliedMetric("errors", "Errors", readNumber(issueCounts, "error"), "number", undefined, "critical"),
      suppliedMetric("warnings", "Warnings", readNumber(issueCounts, "warning"), "number", undefined, "warning"),
      suppliedMetric("info", "Info", readNumber(issueCounts, "info"), "number"),
      suppliedMetric("total-deals", "Deals reviewed", readNumber(record, "totalDeals"), "number"),
      suppliedMetric("total-wos", "Work Orders reviewed", readNumber(record, "totalWorkOrders"), "number"),
      suppliedMetric("malformed-deals", "Malformed deals", readNumber(record, "malformedDeals"), "number", undefined, "warning"),
      suppliedMetric("malformed-wos", "Malformed WOs", readNumber(record, "malformedWorkOrders"), "number", undefined, "warning"),
      suppliedMetric("unmapped-clients", "Unmapped WO clients", readNumber(record, "unmappedWorkOrderClients"), "number", undefined, "warning"),
    ]),
    table: issues.length > 0 ? {
      id: "data-health-issues",
      ariaLabel: "Data health issue details",
      columns,
      rows: issues.map((issue, index) => ({
        id: `${readString(issue, "code") ?? "issue"}-${index}`,
        cells: {
          severity: readString(issue, "severity"),
          entity: readString(issue, "entityId") ?? readString(issue, "entityType"),
          field: readString(issue, "field"),
          issue: readString(issue, "message"),
        },
      })),
      initialVisibleRows: PRIMARY_VISUAL_ROWS,
      remainingLabel: "issues",
    } : undefined,
  };
}

function withTitlePrefix(
  sections: VisualAnalyticsSection[],
  prefix: string,
): VisualAnalyticsSection[] {
  return sections.map((section) => ({
    ...section,
    id: `${prefix}-${section.id}`,
    title: `${prefix} · ${section.title}`,
  }));
}

function sectionsForRecord(
  record: Record<string, unknown>,
  fallbackCurrencyCode?: string,
): VisualAnalyticsSection[] {
  const currencyCode = readString(record, "currencyCode") ?? fallbackCurrencyCode;
  const requestedPeriod = readString(record, "requestedPeriod");
  const hasData = readBoolean(record, "hasData");
  if (requestedPeriod && hasData !== undefined) {
    if (!hasData) {
      const latestAvailablePeriod = readString(record, "latestAvailablePeriod");
      const latestAvailableResult = asRecord(record.latestAvailableResult);
      const notice: VisualAnalyticsSection = {
        id: `period-no-data-${requestedPeriod}`,
        title: `Requested period · ${requestedPeriod}`,
        currencyCode,
        metrics: [],
        notice: {
          title: "No usable data for this period",
          message: latestAvailablePeriod
            ? `Zero is not presented as performance. Latest available period: ${latestAvailablePeriod}.`
            : "Zero is not presented as performance, and no latest available period was supplied.",
        },
      };
      if (!latestAvailableResult) return [notice];
      return [
        notice,
        ...withTitlePrefix(
          sectionsForRecord(latestAvailableResult, currencyCode),
          `Latest available ${latestAvailablePeriod ?? "period"}`,
        ),
      ];
    }
    const result = asRecord(record.result);
    return result ? withTitlePrefix(sectionsForRecord(result, currencyCode), requestedPeriod) : [];
  }

  const ranking = rankingSection(record, currencyCode);
  if (ranking) return [ranking];

  if (Array.isArray(record.matchedClients) && [
    "totalUniqueWorkOrderClientKeys",
    "matchedUniqueWorkOrderClientKeys",
    "unmatchedUniqueWorkOrderClientKeys",
  ].some((key) => hasOwn(record, key))) {
    const section = clientTableSection(recordArray(record.matchedClients), currencyCode, record);
    return section ? [section] : [];
  }

  const pipeline = asRecord(record.pipeline);
  const workOrders = asRecord(record.workOrders);
  const isComposite = Boolean(pipeline || workOrders || Array.isArray(record.sectorMetrics) || asRecord(record.dataQuality));
  if (isComposite) {
    const sections: VisualAnalyticsSection[] = [];
    if (pipeline) {
      const section = pipelineSection(pipeline, currencyCode);
      if (section) sections.push(section);
    }
    if (workOrders) {
      const section = operationsSection(workOrders, currencyCode);
      if (section) sections.push(section);
    }
    if (Array.isArray(record.clientsWithCommercialAndOperationalExposure)) {
      const section = clientTableSection(
        recordArray(record.clientsWithCommercialAndOperationalExposure),
        currencyCode,
      );
      if (section) sections.push(section);
    }
    if (Array.isArray(record.sectorMetrics)) {
      const section = sectorSection(recordArray(record.sectorMetrics), currencyCode);
      if (section) sections.push(section);
    }
    const quality = asRecord(record.dataQuality);
    if (quality) {
      const section = dataHealthSection(quality);
      if (section) sections.push(section);
    }
    return sections;
  }

  if (Array.isArray(record.sectors)) {
    const section = sectorSection(
      recordArray(record.sectors),
      currencyCode,
      readString(record, "period"),
    );
    return section ? [section] : [];
  }

  const operations = operationsSection(record, currencyCode);
  if (operations) return [operations];
  const pipelineSnapshot = pipelineSection(record, currencyCode);
  if (pipelineSnapshot) return [pipelineSnapshot];
  const quality = dataHealthSection(record);
  if (quality) return [quality];
  return [];
}

export function buildVisualAnalytics(
  data: unknown,
  fallbackCurrencyCode?: string,
): VisualAnalyticsSection[] {
  if (Array.isArray(data)) {
    const records = recordArray(data);
    const sector = sectorSection(records, fallbackCurrencyCode);
    if (sector) return [sector];
    const stage = stageSection(records, fallbackCurrencyCode);
    if (stage) return [stage];
    const quarter = quarterSection(records, fallbackCurrencyCode);
    if (quarter) return [quarter];
    if (records.some((record) => hasOwn(record, "normalizedClientKey")) && records.some((record) =>
      hasOwn(record, "openDealValue") || hasOwn(record, "workOrderCount") || hasOwn(record, "receivables"))) {
      const clients = clientTableSection(records, fallbackCurrencyCode);
      return clients ? [clients] : [];
    }
    return [];
  }
  const record = asRecord(data);
  return record ? sectionsForRecord(record, fallbackCurrencyCode) : [];
}

function formatValue(value: CellValue, format: ValueFormat, currencyCode?: string, compact = false): string {
  if (value === null || value === undefined || value === "") return "Unknown";
  if (typeof value === "number") {
    if (format === "currency") {
      return compact ? formatAmount(value, currencyCode) : formatAmountFull(value, currencyCode);
    }
    return formatNumber(value, Number.isInteger(value) ? 0 : 2);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

function MetricCards({ metrics, currencyCode }: { metrics: VisualMetric[]; currencyCode?: string }) {
  if (metrics.length === 0) return null;
  return (
    <div className="copilot-visual-metrics" aria-label="Executive metric cards">
      {metrics.map((metric) => (
        <div
          className={`copilot-visual-metric copilot-visual-metric-${metric.tone ?? "neutral"}`}
          key={metric.id}
        >
          <span>{metric.label}</span>
          <strong className="tabular" title={formatValue(metric.value, metric.format, currencyCode)}>
            {formatValue(metric.value, metric.format, currencyCode, true)}
          </strong>
          {metric.hint ? <small>{metric.hint}</small> : null}
        </div>
      ))}
    </div>
  );
}

function BarChart({ chart, currencyCode }: { chart: VisualChart; currencyCode?: string }) {
  const knownValues = chart.rows.flatMap((row) => row.value === undefined ? [] : [Math.abs(row.value)]);
  const maximum = Math.max(0, ...knownValues);
  return (
    <div className="copilot-chart" role="group" aria-label={chart.ariaLabel}>
      <div className="copilot-chart-heading">
        <h4>{chart.title}</h4>
        <span>{chart.valueLabel}</span>
      </div>
      <ol className="copilot-bar-list">
        {chart.rows.map((row) => {
          const width = row.value === undefined || maximum === 0
            ? 0
            : Math.max(2, (Math.abs(row.value) / maximum) * 100);
          const formatted = formatValue(row.value, chart.valueFormat, currencyCode);
          const style = { "--copilot-bar-width": `${width}%` } as CSSProperties;
          return (
            <li
              className="copilot-bar-row"
              key={row.id}
              aria-label={`${row.rank !== undefined ? `Rank ${row.rank}, ` : ""}${row.label}, ${chart.valueLabel}: ${formatted}${row.secondary.length ? `, ${row.secondary.join(", ")}` : ""}`}
            >
              <div className="copilot-bar-meta">
                {row.rank !== undefined ? <span className="copilot-bar-rank">{row.rank}</span> : null}
                <div className="copilot-bar-label">
                  <strong>{row.label}</strong>
                  {row.secondary.length ? <small>{row.secondary.join(" · ")}</small> : null}
                </div>
                <strong className={`copilot-bar-value tabular${row.value === undefined ? " is-unknown" : ""}`}>
                  {formatted}
                </strong>
              </div>
              <div className="copilot-bar-track" aria-hidden="true">
                <span className="copilot-bar-fill" style={style} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TableRegion({
  table,
  rows,
  currencyCode,
  labelSuffix,
}: {
  table: VisualTable;
  rows: VisualTableRow[];
  currencyCode?: string;
  labelSuffix?: string;
}) {
  return (
    <div
      className="copilot-table-region mobile-safe"
      role="region"
      aria-label={`${table.ariaLabel}${labelSuffix ? ` ${labelSuffix}` : ""}`}
      tabIndex={0}
    >
      <table className="copilot-visual-table">
        <caption className="sr-only">{table.ariaLabel}</caption>
        <thead>
          <tr>{table.columns.map((column) => <th key={column.id} scope="col">{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {table.columns.map((column) => {
                const value = row.cells[column.id];
                return (
                  <td className={value === undefined || value === null || value === "" ? "is-unknown" : undefined} key={column.id}>
                    {formatValue(value, column.format, currencyCode)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResponsiveTable({ table, currencyCode }: { table: VisualTable; currencyCode?: string }) {
  const visibleCount = table.initialVisibleRows ?? table.rows.length;
  const visibleRows = table.rows.slice(0, visibleCount);
  const remainingRows = table.rows.slice(visibleCount);
  return (
    <div className="copilot-table-block">
      <TableRegion table={table} rows={visibleRows} currencyCode={currencyCode} />
      {remainingRows.length > 0 ? (
        <details className="copilot-progressive-details">
          <summary>Show {formatNumber(remainingRows.length)} more {table.remainingLabel ?? "records"}</summary>
          <TableRegion
            table={table}
            rows={remainingRows}
            currencyCode={currencyCode}
            labelSuffix="additional records"
          />
        </details>
      ) : null}
    </div>
  );
}

export function CopilotVisualAnalytics({ sections }: { sections: VisualAnalyticsSection[] }) {
  if (sections.length === 0) return null;
  return (
    <div className="copilot-visual-stack" aria-label="Visual analytics">
      {sections.map((section) => (
        <section className="copilot-visual-section" aria-labelledby={`${section.id}-title`} key={section.id}>
          <div className="copilot-visual-heading">
            <h3 id={`${section.id}-title`}>{section.title}</h3>
            {section.description ? <p>{section.description}</p> : null}
          </div>
          {section.notice ? (
            <div className="copilot-period-notice" role="status">
              <strong>{section.notice.title}</strong>
              <p>{section.notice.message}</p>
            </div>
          ) : null}
          <MetricCards metrics={section.metrics} currencyCode={section.currencyCode} />
          {section.chart ? <BarChart chart={section.chart} currencyCode={section.currencyCode} /> : null}
          {section.table ? <ResponsiveTable table={section.table} currencyCode={section.currencyCode} /> : null}
          {section.additionalCharts?.length ? (
            <details className="copilot-progressive-details">
              <summary>Show additional status distributions</summary>
              <div className="copilot-additional-charts">
                {section.additionalCharts.map((chart) => (
                  <BarChart chart={chart} currencyCode={section.currencyCode} key={chart.id} />
                ))}
              </div>
            </details>
          ) : null}
        </section>
      ))}
    </div>
  );
}
