import { runDataPlatformMigrations } from "../src/lib/data-platform/migrate";

const applied = await runDataPlatformMigrations();
if (applied.length === 0) {
  console.log("Data platform schema is already up to date.");
} else {
  console.log(`Applied data platform migrations: ${applied.join(", ")}`);
}
