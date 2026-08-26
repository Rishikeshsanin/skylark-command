import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "src", "lib", "data-platform", "migrations");

const canonicalIntegratedOrder = [
  "001_temporal_intelligence.sql",
  "002_temporal_production_hardening.sql",
  "003_identity_workspace_rbac.sql",
] as const;

describe("auth/RBAC migration numbering", () => {
  it("reserves migration 002 for temporal production and owns migration 003", () => {
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
    expect(files).toContain("001_temporal_intelligence.sql");
    expect(files).toContain("003_identity_workspace_rbac.sql");
    expect(files.some((file) => /^002_identity_.*workspace_rbac\.sql$/.test(file))).toBe(false);
  });

  it("keeps the intended integrated migration order stable", () => {
    expect([...canonicalIntegratedOrder].sort()).toEqual(canonicalIntegratedOrder);
  });

  it("registers auth/RBAC as 003 without claiming Agent 2's 002 slot", () => {
    const registry = readFileSync(
      join(process.cwd(), "src", "lib", "data-platform", "migrate.ts"),
      "utf8",
    );
    expect(registry).toContain('version: "003_identity_workspace_rbac"');
    expect(registry).toContain('file: "003_identity_workspace_rbac.sql"');
    expect(registry).toContain("002_temporal_production_hardening");
    expect(registry).not.toMatch(/002_identity_.*workspace_rbac/);
  });
});
