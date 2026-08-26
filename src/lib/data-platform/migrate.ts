import "server-only";

import { createHash } from "node:crypto";
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
    version: "002_temporal_production_hardening",
    file: "002_temporal_production_hardening.sql",
  },
  {
    version: "003_identity_workspace_rbac",
    file: "003_identity_workspace_rbac.sql",
  },
] as const;

interface AppliedMigrationRow {
  version: string;
  checksum: string | null;
}

export function checksumMigration(statement: string): string {
  return `sha256:${createHash("sha256").update(statement).digest("hex")}`;
}

export async function runDataPlatformMigrations(sql: Sql = getTemporalSql()): Promise<string[]> {
  const applied: string[] = [];

  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum TEXT
    )
  `);
  await sql.unsafe(`ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT`);

  for (const migration of DATA_PLATFORM_MIGRATIONS) {
    const path = join(process.cwd(), "src", "lib", "data-platform", "migrations", migration.file);
    const statement = await readFile(path, "utf8");
    const checksum = checksumMigration(statement);
    const existing = await sql<AppliedMigrationRow[]>`
      SELECT version, checksum
      FROM schema_migrations
      WHERE version = ${migration.version}
    `;

    if (existing.length > 0) {
      const recordedChecksum = existing[0]?.checksum ?? null;
      if (recordedChecksum && recordedChecksum !== checksum) {
        throw new Error(
          `Migration checksum mismatch for ${migration.version}; applied migrations must never be edited in place.`,
        );
      }
      if (!recordedChecksum) {
        // Existing pre-checksum installations are baselined once. Subsequent
        // edits are then detected deterministically on every migration run.
        await sql`
          UPDATE schema_migrations
          SET checksum = ${checksum}
          WHERE version = ${migration.version}
            AND checksum IS NULL
        `;
      }
      continue;
    }

    await sql.begin(async (tx) => {
      await tx.unsafe(statement);
      await tx`
        INSERT INTO schema_migrations (version, checksum)
        VALUES (${migration.version}, ${checksum})
        ON CONFLICT (version) DO NOTHING
      `;
    });
    applied.push(migration.version);
  }

  return applied;
}
