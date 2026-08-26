import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Sql } from "postgres";
import { getTemporalSql } from "./postgres";

export const DATA_PLATFORM_MIGRATIONS = [
  {
    version: "001_temporal_intelligence",
    file: "001_temporal_intelligence.sql",
  },
  {
    version: "002_identity_workspace_rbac",
    file: "002_identity_workspace_rbac.sql",
  },
] as const;

export async function runDataPlatformMigrations(sql: Sql = getTemporalSql()): Promise<string[]> {
  const applied: string[] = [];

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const migration of DATA_PLATFORM_MIGRATIONS) {
    const existing = await sql<{ version: string }[]>`
      SELECT version FROM schema_migrations WHERE version = ${migration.version}
    `;
    if (existing.length > 0) continue;

    const path = join(process.cwd(), "src", "lib", "data-platform", "migrations", migration.file);
    const statement = await readFile(path, "utf8");

    await sql.begin(async (tx) => {
      await tx.unsafe(statement);
      await tx`
        INSERT INTO schema_migrations (version)
        VALUES (${migration.version})
        ON CONFLICT (version) DO NOTHING
      `;
    });
    applied.push(migration.version);
  }

  return applied;
}
