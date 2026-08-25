import "server-only";

import postgres, { type Sql } from "postgres";
import type { BusinessDataSnapshot } from "@/lib/business-data";
import type { Deal, WorkOrder } from "@/types";
import type {
  PersistSnapshotInput,
  PersistSnapshotResult,
  StoredBusinessDataSnapshot,
  SyncRunRecord,
  TemporalFreshness,
  TemporalSnapshotStore,
} from "./contracts";

const DEFAULT_MAX_CONNECTIONS = 3;

type TimestampValue = string | Date | null;

interface SyncRunRow {
  id: string;
  workspace_key: string;
  source_provider: "monday.com";
  started_at: TimestampValue;
  finished_at: TimestampValue;
  status: SyncRunRecord["status"];
  records_fetched: number;
  records_normalized: number;
  records_persisted: number;
  error_text: string | null;
  source_watermark: string | null;
  snapshot_id: string | null;
}

interface SnapshotRow {
  id: string;
  workspace_key: string;
  snapshot_time: TimestampValue;
  source_fetched_at: TimestampValue;
  source_watermark: string;
  source_metadata: BusinessDataSnapshot["source"];
  normalization_issues: BusinessDataSnapshot["normalizationIssues"];
}

function asIso(value: TimestampValue): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toSyncRun(row: SyncRunRow): SyncRunRecord {
  return {
    id: row.id,
    workspaceKey: row.workspace_key,
    sourceProvider: row.source_provider,
    startedAt: asIso(row.started_at) ?? "",
    finishedAt: asIso(row.finished_at),
    status: row.status,
    recordsFetched: Number(row.records_fetched),
    recordsNormalized: Number(row.records_normalized),
    recordsPersisted: Number(row.records_persisted),
    error: row.error_text,
    sourceWatermark: row.source_watermark,
    snapshotId: row.snapshot_id,
  };
}

function qualityMetadata(record: Deal | WorkOrder) {
  return {
    malformed: record.malformed,
    sourceRow: record.sourceRow,
    sourceQualityFlags: record.sourceQualityFlags,
  };
}

export class PostgresTemporalSnapshotStore implements TemporalSnapshotStore {
  constructor(private readonly sql: Sql) {}

  async beginSync(input: {
    syncId: string;
    workspaceKey: string;
    startedAt: string;
  }): Promise<SyncRunRecord> {
    const [row] = await this.sql<SyncRunRow[]>`
      INSERT INTO sync_runs (
        id, workspace_key, source_provider, started_at, status
      ) VALUES (
        ${input.syncId}, ${input.workspaceKey}, 'monday.com', ${input.startedAt}, 'syncing'
      )
      RETURNING *
    `;
    if (!row) throw new Error("Failed to create sync run.");
    return toSyncRun(row);
  }

  async persistSnapshot(input: PersistSnapshotInput): Promise<PersistSnapshotResult> {
    return this.sql.begin(async (tx) => {
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO analytical_snapshots (
          id, workspace_key, snapshot_time, source_fetched_at, source_watermark,
          source_metadata, normalization_issues, deal_count, work_order_count
        ) VALUES (
          ${input.snapshotId},
          ${input.workspaceKey},
          ${input.snapshotTime},
          ${input.snapshot.source.fetchedAt},
          ${input.sourceWatermark},
          ${JSON.stringify(input.snapshot.source)}::jsonb,
          ${JSON.stringify(input.snapshot.normalizationIssues)}::jsonb,
          ${input.snapshot.deals.length},
          ${input.snapshot.workOrders.length}
        )
        ON CONFLICT (workspace_key, source_watermark) DO NOTHING
        RETURNING id
      `;

      let snapshotId = inserted[0]?.id;
      if (!snapshotId) {
        const existing = await tx<{ id: string }[]>`
          SELECT id
          FROM analytical_snapshots
          WHERE workspace_key = ${input.workspaceKey}
            AND source_watermark = ${input.sourceWatermark}
          LIMIT 1
        `;
        snapshotId = existing[0]?.id;
        if (!snapshotId) throw new Error("Failed to resolve idempotent analytical snapshot.");
        return {
          snapshotId,
          recordsPersisted: 0,
          reusedExistingSnapshot: true,
        };
      }

      for (const deal of input.snapshot.deals) {
        await tx`
          INSERT INTO deal_snapshots (
            snapshot_id, snapshot_time, source_fetched_at, monday_item_id,
            status, stage, value, sector, normalized_client_key,
            created_date, close_date, tentative_close_date, closure_probability,
            quality_metadata, normalized_payload
          ) VALUES (
            ${snapshotId}, ${input.snapshotTime}, ${input.snapshot.source.fetchedAt},
            ${deal.mondayItemId}, ${deal.status}, ${deal.stage}, ${deal.value},
            ${deal.sector}, ${deal.normalizedClientKey}, ${deal.createdDate},
            ${deal.closeDate}, ${deal.tentativeCloseDate}, ${deal.closureProbability},
            ${JSON.stringify(qualityMetadata(deal))}::jsonb,
            ${JSON.stringify(deal)}::jsonb
          )
        `;
      }

      for (const workOrder of input.snapshot.workOrders) {
        await tx`
          INSERT INTO work_order_snapshots (
            snapshot_id, snapshot_time, source_fetched_at, monday_item_id,
            customer_code, normalized_client_key, execution_status,
            probable_start_date, probable_end_date, billing_status,
            collection_status, invoice_status, latest_invoice_number,
            last_invoice_date, amount_incl_gst, billed_value_incl_gst,
            collected_amount_incl_gst, amount_receivable, ar_priority,
            quality_metadata, normalized_payload
          ) VALUES (
            ${snapshotId}, ${input.snapshotTime}, ${input.snapshot.source.fetchedAt},
            ${workOrder.mondayItemId}, ${workOrder.customerCode},
            ${workOrder.normalizedClientKey}, ${workOrder.executionStatus},
            ${workOrder.probableStartDate}, ${workOrder.probableEndDate},
            ${workOrder.billingStatus}, ${workOrder.collectionStatus},
            ${workOrder.invoiceStatus}, ${workOrder.latestInvoiceNumber},
            ${workOrder.lastInvoiceDate}, ${workOrder.amountInclGst},
            ${workOrder.billedValueInclGst}, ${workOrder.collectedAmountInclGst},
            ${workOrder.amountReceivable}, ${workOrder.arPriority},
            ${JSON.stringify(qualityMetadata(workOrder))}::jsonb,
            ${JSON.stringify(workOrder)}::jsonb
          )
        `;
      }

      return {
        snapshotId,
        recordsPersisted: input.snapshot.deals.length + input.snapshot.workOrders.length,
        reusedExistingSnapshot: false,
      };
    });
  }

  async completeSync(input: {
    syncId: string;
    finishedAt: string;
    recordsFetched: number;
    recordsNormalized: number;
    recordsPersisted: number;
    sourceWatermark: string;
    snapshotId: string;
  }): Promise<SyncRunRecord> {
    const [row] = await this.sql<SyncRunRow[]>`
      UPDATE sync_runs
      SET finished_at = ${input.finishedAt},
          status = 'succeeded',
          records_fetched = ${input.recordsFetched},
          records_normalized = ${input.recordsNormalized},
          records_persisted = ${input.recordsPersisted},
          error_text = NULL,
          source_watermark = ${input.sourceWatermark},
          snapshot_id = ${input.snapshotId}
      WHERE id = ${input.syncId}
      RETURNING *
    `;
    if (!row) throw new Error("Failed to complete sync run.");
    return toSyncRun(row);
  }

  async failSync(input: {
    syncId: string;
    finishedAt: string;
    error: string;
  }): Promise<SyncRunRecord> {
    const [row] = await this.sql<SyncRunRow[]>`
      UPDATE sync_runs
      SET finished_at = ${input.finishedAt},
          status = 'failed',
          error_text = ${input.error}
      WHERE id = ${input.syncId}
      RETURNING *
    `;
    if (!row) throw new Error("Failed to record failed sync run.");
    return toSyncRun(row);
  }

  async loadLatestSuccessfulSnapshot(workspaceKey: string): Promise<StoredBusinessDataSnapshot | null> {
    const rows = await this.sql<SnapshotRow[]>`
      SELECT s.id, s.workspace_key, s.snapshot_time, s.source_fetched_at,
             s.source_watermark, s.source_metadata, s.normalization_issues
      FROM sync_runs r
      JOIN analytical_snapshots s ON s.id = r.snapshot_id
      WHERE r.workspace_key = ${workspaceKey}
        AND r.status = 'succeeded'
      ORDER BY r.finished_at DESC NULLS LAST, r.started_at DESC
      LIMIT 1
    `;
    const snapshot = rows[0];
    if (!snapshot) return null;

    const deals = await this.sql<{ normalized_payload: Deal }[]>`
      SELECT normalized_payload
      FROM deal_snapshots
      WHERE snapshot_id = ${snapshot.id}
      ORDER BY monday_item_id
    `;
    const workOrders = await this.sql<{ normalized_payload: WorkOrder }[]>`
      SELECT normalized_payload
      FROM work_order_snapshots
      WHERE snapshot_id = ${snapshot.id}
      ORDER BY monday_item_id
    `;

    return {
      deals: deals.map((row) => row.normalized_payload),
      workOrders: workOrders.map((row) => row.normalized_payload),
      normalizationIssues: snapshot.normalization_issues,
      source: snapshot.source_metadata,
      temporal: {
        snapshotId: snapshot.id,
        snapshotTime: asIso(snapshot.snapshot_time) ?? "",
        sourceWatermark: snapshot.source_watermark,
      },
    };
  }

  async getFreshness(input: {
    workspaceKey: string;
    now: string;
    staleAfterMs: number;
  }): Promise<TemporalFreshness> {
    const latestRows = await this.sql<SyncRunRow[]>`
      SELECT *
      FROM sync_runs
      WHERE workspace_key = ${input.workspaceKey}
      ORDER BY started_at DESC
      LIMIT 1
    `;
    const successRows = await this.sql<(SyncRunRow & { snapshot_time: TimestampValue })[]>`
      SELECT r.*, s.snapshot_time
      FROM sync_runs r
      JOIN analytical_snapshots s ON s.id = r.snapshot_id
      WHERE r.workspace_key = ${input.workspaceKey}
        AND r.status = 'succeeded'
      ORDER BY r.finished_at DESC NULLS LAST, r.started_at DESC
      LIMIT 1
    `;

    const latest = latestRows[0];
    const success = successRows[0];
    const lastSucceededAt = success ? asIso(success.finished_at) : null;
    let state: TemporalFreshness["state"];

    if (latest?.status === "syncing") {
      state = "syncing";
    } else if (latest?.status === "failed") {
      state = "failed";
    } else if (!lastSucceededAt) {
      state = "stale";
    } else {
      state = Date.parse(input.now) - Date.parse(lastSucceededAt) > input.staleAfterMs
        ? "stale"
        : "fresh";
    }

    return {
      state,
      lastSyncStartedAt: latest ? asIso(latest.started_at) : null,
      lastSyncSucceededAt: lastSucceededAt,
      sourceWatermark: success?.source_watermark ?? null,
      servedSnapshotAt: success ? asIso(success.snapshot_time) : null,
    };
  }
}

const globalSql = globalThis as typeof globalThis & {
  __skylarkTemporalSql?: Sql;
};

export function getTemporalSql(): Sql {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for temporal data mode.");
  }

  if (!globalSql.__skylarkTemporalSql) {
    globalSql.__skylarkTemporalSql = postgres(connectionString, {
      max: DEFAULT_MAX_CONNECTIONS,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    });
  }
  return globalSql.__skylarkTemporalSql;
}

export function createPostgresTemporalSnapshotStore(): PostgresTemporalSnapshotStore {
  return new PostgresTemporalSnapshotStore(getTemporalSql());
}
