CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS analytical_snapshots (
  id UUID PRIMARY KEY,
  workspace_key TEXT NOT NULL,
  snapshot_time TIMESTAMPTZ NOT NULL,
  source_fetched_at TIMESTAMPTZ NOT NULL,
  source_watermark TEXT NOT NULL,
  source_metadata JSONB NOT NULL,
  normalization_issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  deal_count INTEGER NOT NULL CHECK (deal_count >= 0),
  work_order_count INTEGER NOT NULL CHECK (work_order_count >= 0),
  UNIQUE (workspace_key, source_watermark)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY,
  workspace_key TEXT NOT NULL,
  source_provider TEXT NOT NULL CHECK (source_provider = 'monday.com'),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('syncing', 'succeeded', 'failed')),
  records_fetched INTEGER NOT NULL DEFAULT 0 CHECK (records_fetched >= 0),
  records_normalized INTEGER NOT NULL DEFAULT 0 CHECK (records_normalized >= 0),
  records_persisted INTEGER NOT NULL DEFAULT 0 CHECK (records_persisted >= 0),
  error_text TEXT,
  source_watermark TEXT,
  snapshot_id UUID REFERENCES analytical_snapshots(id)
);

CREATE INDEX IF NOT EXISTS sync_runs_workspace_started_idx
  ON sync_runs (workspace_key, started_at DESC);
CREATE INDEX IF NOT EXISTS sync_runs_workspace_success_idx
  ON sync_runs (workspace_key, finished_at DESC)
  WHERE status = 'succeeded';

CREATE TABLE IF NOT EXISTS deal_snapshots (
  snapshot_id UUID NOT NULL REFERENCES analytical_snapshots(id) ON DELETE CASCADE,
  snapshot_time TIMESTAMPTZ NOT NULL,
  source_fetched_at TIMESTAMPTZ NOT NULL,
  monday_item_id TEXT NOT NULL,
  status TEXT,
  stage TEXT,
  value NUMERIC,
  sector TEXT,
  normalized_client_key TEXT,
  created_date DATE,
  close_date DATE,
  tentative_close_date DATE,
  closure_probability TEXT,
  quality_metadata JSONB NOT NULL,
  normalized_payload JSONB NOT NULL,
  PRIMARY KEY (snapshot_id, monday_item_id)
);

CREATE INDEX IF NOT EXISTS deal_snapshots_client_idx
  ON deal_snapshots (normalized_client_key, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS deal_snapshots_item_history_idx
  ON deal_snapshots (monday_item_id, snapshot_time DESC);

CREATE TABLE IF NOT EXISTS work_order_snapshots (
  snapshot_id UUID NOT NULL REFERENCES analytical_snapshots(id) ON DELETE CASCADE,
  snapshot_time TIMESTAMPTZ NOT NULL,
  source_fetched_at TIMESTAMPTZ NOT NULL,
  monday_item_id TEXT NOT NULL,
  customer_code TEXT,
  normalized_client_key TEXT,
  execution_status TEXT,
  probable_start_date DATE,
  probable_end_date DATE,
  billing_status TEXT,
  collection_status TEXT,
  invoice_status TEXT,
  latest_invoice_number TEXT,
  last_invoice_date DATE,
  amount_incl_gst NUMERIC,
  billed_value_incl_gst NUMERIC,
  collected_amount_incl_gst NUMERIC,
  amount_receivable NUMERIC,
  ar_priority TEXT,
  quality_metadata JSONB NOT NULL,
  normalized_payload JSONB NOT NULL,
  PRIMARY KEY (snapshot_id, monday_item_id)
);

CREATE INDEX IF NOT EXISTS work_order_snapshots_client_idx
  ON work_order_snapshots (normalized_client_key, snapshot_time DESC);
CREATE INDEX IF NOT EXISTS work_order_snapshots_item_history_idx
  ON work_order_snapshots (monday_item_id, snapshot_time DESC);
