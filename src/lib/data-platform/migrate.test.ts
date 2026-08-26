import { describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import {
  checksumMigration,
  DATA_PLATFORM_MIGRATIONS,
  runDataPlatformMigrations,
} from "./migrate";

function fakeMigrationSql() {
  const migrations = new Map<string, string | null>();
  const unsafeStatements: string[] = [];

  const tagged = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("SELECT version, checksum") && text.includes("FROM schema_migrations")) {
      const version = String(values[0]);
      return migrations.has(version)
        ? [{ version, checksum: migrations.get(version) ?? null }]
        : [];
    }
    if (text.includes("UPDATE schema_migrations") && text.includes("SET checksum")) {
      const checksum = String(values[0]);
      const version = String(values[1]);
      if (migrations.get(version) === null) migrations.set(version, checksum);
      return [];
    }
    if (text.includes("INSERT INTO schema_migrations")) {
      const version = String(values[0]);
      const checksum = String(values[1]);
      if (!migrations.has(version)) migrations.set(version, checksum);
      return [];
    }
    return [];
  };

  const sql = tagged as unknown as Sql;
  Object.assign(sql, {
    unsafe: async (statement: string) => {
      unsafeStatements.push(statement);
      return [];
    },
    begin: async (callback: (tx: Sql) => Promise<unknown>) => callback(sql),
  });

  return { sql, migrations, unsafeStatements };
}

const canonicalOrder = [
  "001_temporal_intelligence",
  "002_temporal_production_hardening",
  "003_identity_workspace_rbac",
] as const;

describe("temporal migration production guardrails", () => {
  it("discovers and applies the canonical 001/002/003 order exactly once", async () => {
    expect(DATA_PLATFORM_MIGRATIONS.map((migration) => migration.version)).toEqual(canonicalOrder);

    const fake = fakeMigrationSql();
    expect(await runDataPlatformMigrations(fake.sql)).toEqual(canonicalOrder);
    expect(await runDataPlatformMigrations(fake.sql)).toEqual([]);
    expect(fake.migrations.size).toBe(3);

    for (const checksum of fake.migrations.values()) {
      expect(checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    }

    expect(
      fake.unsafeStatements.some((statement) => statement.includes("analytical_snapshots_workspace_time_idx")),
    ).toBe(true);
    expect(
      fake.unsafeStatements.some((statement) => statement.includes("sync_runs_workspace_active_idx")),
    ).toBe(true);
    expect(
      fake.unsafeStatements.some((statement) => statement.includes("workspace_members")),
    ).toBe(true);
  });

  it("fails closed when an already-recorded migration changes", async () => {
    const fake = fakeMigrationSql();
    await runDataPlatformMigrations(fake.sql);
    fake.migrations.set("001_temporal_intelligence", `sha256:${"0".repeat(64)}`);
    await expect(runDataPlatformMigrations(fake.sql)).rejects.toThrow(/checksum mismatch/i);
  });

  it("uses deterministic SHA-256 migration checksums", () => {
    expect(checksumMigration("select 1;"))
      .toBe(checksumMigration("select 1;"));
    expect(checksumMigration("select 1;"))
      .not.toBe(checksumMigration("select 2;"));
  });
});
