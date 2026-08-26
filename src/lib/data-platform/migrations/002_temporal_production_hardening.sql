CREATE INDEX IF NOT EXISTS analytical_snapshots_workspace_time_idx
  ON analytical_snapshots (workspace_key, snapshot_time DESC, id DESC);

CREATE INDEX IF NOT EXISTS sync_runs_workspace_snapshot_success_idx
  ON sync_runs (workspace_key, snapshot_id)
  WHERE status = 'succeeded' AND snapshot_id IS NOT NULL;

-- A workspace may have only one actively running sync. This makes overlapping
-- scheduler/manual invocations fail closed instead of racing to persist history.
CREATE UNIQUE INDEX IF NOT EXISTS sync_runs_workspace_active_idx
  ON sync_runs (workspace_key)
  WHERE status = 'syncing';

-- Supabase exposes the public schema through its Data API by default. When the
-- standard Supabase API roles exist, keep these server-side temporal tables out
-- of the browser/API surface and enable RLS as defense in depth. Table owners
-- used by server-side DATABASE_URL connections continue to retain owner access.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    FOREACH table_name IN ARRAY ARRAY[
      'schema_migrations',
      'analytical_snapshots',
      'sync_runs',
      'deal_snapshots',
      'work_order_snapshots'
    ]
    LOOP
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM anon', table_name);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE %I FROM authenticated', table_name);
      END IF;
    END LOOP;
  END IF;
END
$$;
